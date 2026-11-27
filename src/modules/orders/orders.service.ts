import type { Prisma } from '@prisma/client';
import { inTx, prisma } from '@/shared/db/prisma';
import { E } from '@/shared/errors/app-error';
import { publish } from '@/shared/events/bus';
import { cleanOptional, cleanText } from '@/shared/security/sanitize';
import { rateLimit } from '@/shared/security/rate-limit';
import { newOrderNumber } from '@/shared/utils/ids';
import type { SessionUser } from '@/modules/auth/auth.guard';
import { resolveBranchId } from '@/modules/menu/menu.service';
import { notifyOrderStatus } from '@/modules/notifications/notifications.service';
import { priceCart } from '@/modules/pricing/pricing.service';
import { canTransition, CUSTOMER_CANCELLABLE, type OrderStatusLite } from './order-status';
import { orderInclude, ordersRepository as repo, type OrderWithRelations } from './orders.repository';
import type { CheckoutInput } from './orders.schema';

export type NextAction = 'ONLINE_PAYMENT' | 'COD_OTP' | 'DONE';

const ONLINE_METHODS = ['UPI', 'CARD', 'NETBANKING', 'WALLET'];

function nowIstHHmm(): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(new Date());
}

function assertOpen(branch: { name: string; openTime: string; closeTime: string }) {
  const now = nowIstHHmm();
  if (now < branch.openTime || now >= branch.closeTime) {
    throw E.unprocessable(`${branch.name} is closed right now. We take orders between ${branch.openTime} and ${branch.closeTime}.`);
  }
}

/** Push live updates to the customer's tracker and the kitchen screen. */
export function broadcastOrder(order: { id: string; status: string; branchId: string; orderNumber: string }) {
  const payload = { kind: 'order', orderId: order.id, status: order.status, branchId: order.branchId, orderNumber: order.orderNumber };
  publish(`order:${order.id}`, payload);
  publish('staff', payload);
}

// ---------------------------------------------------------------------------
// Create
// ---------------------------------------------------------------------------

export async function createOrder(input: CheckoutInput, user: SessionUser | null) {
  if (input.type !== 'DINE_IN' && !user) {
    throw E.unauthorized('Please sign in to place a delivery or takeaway order');
  }

  const branchId = await resolveBranchId(input.branchId);
  const method = input.paymentMethod;
  const online = ONLINE_METHODS.includes(method);
  const awaitingConfirmation = online || method === 'COD';

  const customerName = cleanText(input.customer.name, 80);
  const notes = cleanOptional(input.notes, 300);
  const address = input.address
    ? {
        name: cleanText(input.address.name, 80),
        line1: cleanText(input.address.line1, 150),
        line2: cleanOptional(input.address.line2, 150),
        landmark: cleanOptional(input.address.landmark, 100),
        city: cleanText(input.address.city, 60),
        state: cleanText(input.address.state, 60),
        pincode: input.address.pincode,
      }
    : undefined;

  const order = await inTx(async (tx) => {
    const priced = await priceCart({
      db: tx,
      branchId,
      type: input.type,
      lines: input.items,
      pincode: address?.pincode,
      couponCode: input.couponCode,
      userId: user?.id,
    });
    if (input.type !== 'DINE_IN') assertOpen(priced.branch);

    let tableId: string | undefined;
    if (input.type === 'DINE_IN') {
      const table = await tx.diningTable.findFirst({
        where: { branchId, qrToken: input.tableToken!, isActive: true, branch: { isActive: true } },
      });
      if (!table || !table.isActive) throw E.notFound('Table not found. Please scan the QR code again.');
      tableId = table.id;
    }

    // Counted stock: conditional decrement – cannot oversell even under concurrency.
    for (const [itemId, qty] of priced.stockTracked) {
      const ok = await repo.decrementStock(tx, branchId, itemId, qty);
      if (!ok) throw E.conflict('An item just ran out of stock. Please review your cart.');
    }

    // Limited-use coupon: row lock, then re-check per-user limit while holding the lock.
    if (priced.coupon) {
      const ok = await repo.lockAndConsumeCoupon(tx, priced.coupon.id);
      if (!ok) throw E.unprocessable('This coupon has just been fully redeemed');
      const used = await tx.couponRedemption.count({ where: { couponId: priced.coupon.id, userId: user!.id } });
      if (used >= priced.coupon.perUserLimit) throw E.unprocessable('You have already used this coupon');
    }

    const p = priced.pricing;
    const status = awaitingConfirmation ? 'PENDING_PAYMENT' : 'PLACED';

    const created = await tx.order.create({
      data: {
        orderNumber: newOrderNumber(),
        userId: user?.id,
        branchId,
        tableId,
        type: input.type,
        status,
        customerName,
        customerPhone: input.customer.phone,
        customerEmail: input.customer.email || null,
        deliveryAddress: address as Prisma.InputJsonValue | undefined,
        deliveryPincode: address?.pincode,
        notes,
        subtotalPaise: p.subtotalPaise,
        discountPaise: p.discountPaise,
        taxableAmountPaise: p.taxablePaise,
        cgstPaise: p.cgstPaise,
        sgstPaise: p.sgstPaise,
        packagingPaise: p.packagingPaise,
        deliveryFeePaise: p.deliveryFeePaise,
        roundOffPaise: p.roundOffPaise,
        totalPaise: p.totalPaise,
        couponCode: p.couponCode,
        paymentMethod: method,
        placedAt: status === 'PLACED' ? new Date() : null,
        items: {
          create: priced.lines.map((l) => ({
            menuItemId: l.menuItemId,
            name: l.name,
            diet: l.diet,
            variantName: l.variantName,
            unitPricePaise: l.unitPricePaise,
            addons: l.addons as Prisma.InputJsonValue,
            addonsTotalPaise: l.addonsTotalPaise,
            quantity: l.quantity,
            lineTotalPaise: l.lineTotalPaise,
            instructions: l.instructions,
            jain: l.jain,
          })),
        },
        events: { create: { status, note: 'Order created' } },
        payments:
          method === 'COD' || method === 'PAY_AT_COUNTER'
            ? {
                create: {
                  provider: method === 'COD' ? 'COD' : 'COUNTER',
                  method,
                  status: 'COD_PENDING',
                  amountPaise: p.totalPaise,
                },
              }
            : undefined,
      },
      include: orderInclude,
    });

    if (priced.coupon) {
      await tx.couponRedemption.create({
        data: { couponId: priced.coupon.id, userId: user?.id, orderId: created.id, amountPaise: p.discountPaise },
      });
    }
    return created;
  });

  if (order.status === 'PLACED') {
    broadcastOrder(order);
    notifyOrderStatus(order);
  }

  const next: NextAction = online ? 'ONLINE_PAYMENT' : method === 'COD' ? 'COD_OTP' : 'DONE';
  return { order, next };
}

// ---------------------------------------------------------------------------
// Status transitions
// ---------------------------------------------------------------------------

/** Apply a transition inside the caller's transaction. Call `effects()` AFTER the transaction commits. */
export async function transitionInTx(
  tx: Prisma.TransactionClient,
  orderId: string,
  to: OrderStatusLite,
  opts: { actorId?: string; note?: string } = {},
) {
  const order = await tx.order.findUnique({ where: { id: orderId } });
  if (!order) throw E.notFound('Order not found');
  if (!canTransition(order.status, to, order.type)) {
    throw E.conflict(`Cannot move an order from ${order.status.replace(/_/g, ' ')} to ${to.replace(/_/g, ' ')}`);
  }

  const now = new Date();
  const res = await tx.order.updateMany({
    where: { id: orderId, status: order.status }, // optimistic concurrency guard
    data: {
      status: to,
      ...(to === 'PLACED' ? { placedAt: now } : {}),
      ...(to === 'ACCEPTED' ? { acceptedAt: now } : {}),
      ...(to === 'DELIVERED' || to === 'COMPLETED' ? { deliveredAt: now } : {}),
      ...(to === 'CANCELLED' ? { cancelledAt: now, cancelReason: opts.note } : {}),
    },
  });
  if (res.count !== 1) throw E.conflict('This order was just updated by someone else. Please refresh.');

  await tx.orderStatusEvent.create({ data: { orderId, status: to, actorId: opts.actorId, note: opts.note } });

  if (to === 'CANCELLED') {
    const items = await tx.orderItem.findMany({ where: { orderId } });
    for (const it of items) {
      if (it.menuItemId) await repo.restoreStock(tx, order.branchId, it.menuItemId, it.quantity);
    }
    await repo.releaseCoupon(tx, orderId);
  }

  const updated = (await repo.findById(tx, orderId))!;
  return {
    order: updated,
    effects: () => {
      broadcastOrder(updated);
      notifyOrderStatus(updated);
    },
  };
}

export async function changeStatus(orderId: string, to: OrderStatusLite, actor: SessionUser, note?: string) {
  const { order, effects } = await inTx((tx) =>
    transitionInTx(tx, orderId, to, { actorId: actor.id, note: note ? cleanText(note, 200) : undefined }),
  );
  effects();
  return order;
}

export async function cancelByCustomer(orderId: string, user: SessionUser, reason?: string) {
  const existing = await prisma.order.findUnique({ where: { id: orderId } });
  if (!existing || existing.userId !== user.id) throw E.notFound('Order not found');
  if (!CUSTOMER_CANCELLABLE.includes(existing.status)) {
    throw E.conflict('This order is already being prepared and can no longer be cancelled. Please call the restaurant.');
  }
  return changeStatus(orderId, 'CANCELLED', user, reason ?? 'Cancelled by customer');
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

export async function getOrderForViewer(orderId: string, user: SessionUser | null): Promise<OrderWithRelations> {
  const order = await repo.findById(prisma, orderId);
  if (!order) throw E.notFound('Order not found');
  const staff = user?.role === 'ADMIN' || user?.role === 'KITCHEN_STAFF';
  // Orders with an owner are private. Guest dine-in orders are viewable by their unguessable id.
  if (order.userId && !(staff || user?.id === order.userId)) throw E.notFound('Order not found');
  return order;
}

export function listMyOrders(user: SessionUser) {
  return repo.listForUser(user.id);
}

export async function listForStaff(scope: 'active' | 'all', limit: number) {
  const [orders, billRequests] = await Promise.all([
    scope === 'active' ? repo.listActiveForStaff() : repo.listAllForStaff(limit),
    repo.openBillRequests(),
  ]);
  return { orders, billRequests };
}

// ---------------------------------------------------------------------------
// Dine-in: request the bill
// ---------------------------------------------------------------------------

export async function requestBill(tableCode: string, branchValue: string | undefined, ip: string) {
  const branchId = await resolveBranchId(branchValue);
  const table = await prisma.diningTable.findUnique({
    where: { branchId_code: { branchId, code: tableCode.toUpperCase() } },
  });
  if (!table || !table.isActive) throw E.notFound('Table not found');
  await rateLimit(`bill:${table.id}`, 3, 600, 'Bill already requested. Our team is on the way.');
  await rateLimit(`bill-ip:${ip}`, 20, 3600);

  const open = await prisma.billRequest.findFirst({ where: { tableId: table.id, status: 'OPEN' } });
  const request = open ?? (await prisma.billRequest.create({ data: { tableId: table.id } }));
  publish('staff', { kind: 'bill', tableCode: table.code, requestId: request.id });
  return { requested: true };
}

export async function resolveBillRequest(id: string) {
  const r = await prisma.billRequest.update({ where: { id }, data: { status: 'RESOLVED', resolvedAt: new Date() } });
  publish('staff', { kind: 'bill', requestId: r.id });
  return { resolved: true };
}
