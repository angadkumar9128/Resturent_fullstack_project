import type { Prisma } from '@prisma/client';
import { env } from '@/shared/config/env';
import { inTx, prisma } from '@/shared/db/prisma';
import { AppError, E } from '@/shared/errors/app-error';
import { sendOtp, verifyOtp } from '@/modules/auth/otp.service';
import type { SessionUser } from '@/modules/auth/auth.guard';
import { transitionInTx } from '@/modules/orders/orders.service';
import { createRazorpayOrder, razorpayConfigured, refundRazorpayPayment } from './razorpay.client';
import { verifyCheckoutSignature, verifyWebhookSignature } from './signature';

const METHOD_MAP: Record<string, 'UPI' | 'CARD' | 'NETBANKING' | 'WALLET'> = {
  upi: 'UPI',
  card: 'CARD',
  netbanking: 'NETBANKING',
  wallet: 'WALLET',
};

// ---------------------------------------------------------------------------
// Start an online payment
// ---------------------------------------------------------------------------

export async function initiateOnline(orderId: string, user: SessionUser | null) {
  if (!razorpayConfigured()) {
    throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Online payments are not configured yet. Please choose another payment method.');
  }
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || (order.userId && order.userId !== user?.id)) throw E.notFound('Order not found');
  if (order.status !== 'PENDING_PAYMENT') throw E.conflict('This order is not awaiting payment');
  if (order.paymentMethod === 'COD' || order.paymentMethod === 'PAY_AT_COUNTER') {
    throw E.badRequest('This order is not an online-payment order');
  }

  // Re-use the open gateway order on retry so the customer can try again without duplicates.
  let payment = await prisma.payment.findFirst({
    where: { orderId, provider: 'RAZORPAY', status: { in: ['CREATED', 'FAILED'] }, providerOrderId: { not: null } },
    orderBy: { createdAt: 'desc' },
  });
  if (!payment) {
    // Amount comes from the server-computed order total, never from the client.
    const rzp = await createRazorpayOrder({
      amountPaise: order.totalPaise,
      receipt: order.orderNumber,
      notes: { orderId: order.id },
    });
    payment = await prisma.payment.create({
      data: {
        orderId,
        provider: 'RAZORPAY',
        method: order.paymentMethod,
        status: 'CREATED',
        amountPaise: order.totalPaise,
        providerOrderId: rzp.id,
      },
    });
  }

  return {
    keyId: env.RAZORPAY_KEY_ID!,
    razorpayOrderId: payment.providerOrderId!,
    amountPaise: payment.amountPaise,
    currency: 'INR',
    orderId: order.id,
    orderNumber: order.orderNumber,
    prefill: { name: order.customerName, phone: order.customerPhone, email: order.customerEmail },
  };
}

// ---------------------------------------------------------------------------
// Capture (shared by checkout verification and webhooks – fully idempotent)
// ---------------------------------------------------------------------------

interface CaptureArgs {
  paymentId: string;
  orderId: string;
  rzpPaymentId: string;
  signature?: string;
  method?: string;
}

async function capturePayment(a: CaptureArgs): Promise<void> {
  const result = await inTx(async (tx) => {
    // Claim the payment. Only ONE caller can flip it to CAPTURED; all duplicates see count = 0.
    const claimed = await tx.payment.updateMany({
      where: { id: a.paymentId, status: { in: ['CREATED', 'AUTHORIZED', 'FAILED'] } },
      data: {
        status: 'CAPTURED',
        providerPaymentId: a.rzpPaymentId,
        signature: a.signature,
        ...(a.method && METHOD_MAP[a.method] ? { method: METHOD_MAP[a.method] } : {}),
      },
    });
    if (claimed.count === 0) return { already: true } as { already: boolean; effects?: () => void; needsRefund?: boolean };

    const order = await tx.order.findUnique({ where: { id: a.orderId }, select: { status: true } });
    if (order?.status === 'PENDING_PAYMENT') {
      const t = await transitionInTx(tx, a.orderId, 'PLACED', { note: 'Online payment received' });
      return { already: false, effects: t.effects };
    }
    // Paid after the order was cancelled/expired → money must go back.
    await tx.payment.update({ where: { id: a.paymentId }, data: { status: 'REFUND_PENDING' } });
    return { already: false, needsRefund: true };
  });

  if (result.effects) result.effects();
  if (result.needsRefund) await refundIfNeeded(a.orderId);
}

/** Called by the browser after Razorpay Checkout succeeds. Verifies the HMAC signature server-side. */
export async function verifyAndCapture(
  args: { orderId: string; razorpayOrderId: string; razorpayPaymentId: string; razorpaySignature: string },
  user: SessionUser | null,
) {
  if (!env.RAZORPAY_KEY_SECRET) throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Online payments are not configured');

  const payment = await prisma.payment.findUnique({
    where: { providerOrderId: args.razorpayOrderId },
    include: { order: { select: { userId: true } } },
  });
  if (!payment || payment.orderId !== args.orderId) throw E.notFound('Payment not found');
  if (payment.order.userId && payment.order.userId !== user?.id) throw E.notFound('Payment not found');

  const ok = verifyCheckoutSignature(args.razorpayOrderId, args.razorpayPaymentId, args.razorpaySignature, env.RAZORPAY_KEY_SECRET);
  if (!ok) throw E.badRequest('Payment verification failed. If money was deducted it will be refunded automatically.');

  await capturePayment({
    paymentId: payment.id,
    orderId: payment.orderId,
    rzpPaymentId: args.razorpayPaymentId,
    signature: args.razorpaySignature,
  });
  return { orderId: payment.orderId, status: 'PLACED' };
}

// ---------------------------------------------------------------------------
// Refunds
// ---------------------------------------------------------------------------

/** Best-effort: refund captured online payments for a cancelled order. Never throws. */
export async function refundIfNeeded(orderId: string): Promise<void> {
  try {
    const payments = await prisma.payment.findMany({
      where: {
        orderId,
        provider: 'RAZORPAY',
        status: { in: ['CAPTURED', 'REFUND_PENDING'] },
        providerPaymentId: { not: null },
        refundedPaise: 0,
      },
    });
    for (const p of payments) {
      try {
        await refundRazorpayPayment(p.providerPaymentId!, p.amountPaise);
        await prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUND_PENDING', refundedPaise: p.amountPaise } });
      } catch (e) {
        console.error('Refund failed – needs manual action', p.id, e);
        await prisma.payment.update({ where: { id: p.id }, data: { status: 'REFUND_PENDING', failureReason: 'Auto-refund failed' } });
      }
    }
  } catch (e) {
    console.error('refundIfNeeded error', e);
  }
}

// ---------------------------------------------------------------------------
// Webhooks (idempotent)
// ---------------------------------------------------------------------------

interface RzpPaymentEntity {
  id: string;
  order_id: string;
  amount: number;
  method?: string;
  error_description?: string;
}
interface RzpEvent {
  event: string;
  created_at?: number;
  payload?: {
    payment?: { entity: RzpPaymentEntity };
    refund?: { entity: { id: string; payment_id: string; amount: number } };
  };
}

export async function handleWebhook(rawBody: string, signature: string | null, eventIdHeader: string | null) {
  const secret = env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Webhook secret not configured');
  if (!signature || !verifyWebhookSignature(rawBody, signature, secret)) {
    throw new AppError(400, 'BAD_SIGNATURE', 'Invalid webhook signature');
  }

  const event = JSON.parse(rawBody) as RzpEvent;
  const eventId =
    eventIdHeader ??
    `${event.event}:${event.payload?.payment?.entity.id ?? event.payload?.refund?.entity.id ?? ''}:${event.created_at ?? ''}`;

  let record = await prisma.webhookEvent.findUnique({ where: { provider_eventId: { provider: 'RAZORPAY', eventId } } });
  if (record?.processedAt) return { duplicate: true };
  if (!record) {
    try {
      record = await prisma.webhookEvent.create({
        data: { provider: 'RAZORPAY', eventId, eventType: event.event, payload: event as unknown as Prisma.InputJsonValue },
      });
    } catch (e) {
      if ((e as { code?: string }).code === 'P2002') return { duplicate: true }; // concurrent delivery
      throw e;
    }
  }

  try {
    await processEvent(event);
    await prisma.webhookEvent.update({ where: { id: record.id }, data: { processedAt: new Date(), error: null } });
  } catch (e) {
    await prisma.webhookEvent.update({ where: { id: record.id }, data: { error: String((e as Error).message).slice(0, 500) } });
    throw e; // non-2xx => Razorpay retries
  }
  return { ok: true };
}

async function processEvent(event: RzpEvent) {
  switch (event.event) {
    case 'payment.captured':
    case 'order.paid': {
      const pay = event.payload?.payment?.entity;
      if (!pay?.order_id) return;
      const payment = await prisma.payment.findUnique({ where: { providerOrderId: pay.order_id } });
      if (!payment) return; // not one of ours
      if (pay.amount !== payment.amountPaise) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: { status: 'FAILED', failureReason: `Amount mismatch (paid ${pay.amount}, expected ${payment.amountPaise})` },
        });
        return;
      }
      await capturePayment({ paymentId: payment.id, orderId: payment.orderId, rzpPaymentId: pay.id, method: pay.method });
      return;
    }
    case 'payment.failed': {
      const pay = event.payload?.payment?.entity;
      if (!pay?.order_id) return;
      await prisma.payment.updateMany({
        where: { providerOrderId: pay.order_id, status: { in: ['CREATED', 'AUTHORIZED'] } },
        data: { status: 'FAILED', failureReason: pay.error_description?.slice(0, 200) },
      });
      return;
    }
    case 'refund.processed': {
      const refund = event.payload?.refund?.entity;
      if (!refund?.payment_id) return;
      await prisma.payment.updateMany({
        where: { providerPaymentId: refund.payment_id },
        data: { status: 'REFUNDED', refundedPaise: refund.amount },
      });
      return;
    }
    default:
      return; // ignore events we don't care about
  }
}

// ---------------------------------------------------------------------------
// Cash on delivery: the phone must be verified with an OTP before the kitchen sees the order
// ---------------------------------------------------------------------------

async function loadCodOrder(orderId: string, user: SessionUser) {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  if (!order || order.userId !== user.id) throw E.notFound('Order not found');
  if (order.paymentMethod !== 'COD' || order.status !== 'PENDING_PAYMENT') {
    throw E.conflict('This order does not need COD verification');
  }
  return order;
}

export async function sendCodOtp(orderId: string, user: SessionUser, ip: string) {
  const order = await loadCodOrder(orderId, user);
  await sendOtp({ phone: order.customerPhone, purpose: 'COD_VERIFY', orderId, ip });
  return { sent: true, phoneLast4: order.customerPhone.slice(-4) };
}

export async function verifyCodOtp(orderId: string, code: string, user: SessionUser) {
  const order = await loadCodOrder(orderId, user);
  const ok = await verifyOtp({ phone: order.customerPhone, purpose: 'COD_VERIFY', code, orderId });
  if (!ok) throw E.badRequest('Incorrect or expired code');
  const { effects } = await inTx((tx) => transitionInTx(tx, orderId, 'PLACED', { note: 'COD verified by OTP' }));
  effects();
  return { orderId, status: 'PLACED' };
}

// ---------------------------------------------------------------------------
// Housekeeping: release stock/coupons held by abandoned checkouts
// ---------------------------------------------------------------------------

export async function expireStalePendingOrders(olderThanMinutes = 30) {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000);
  const stale = await prisma.order.findMany({
    where: { status: 'PENDING_PAYMENT', createdAt: { lt: cutoff } },
    select: { id: true },
    take: 200,
  });
  let cancelled = 0;
  for (const o of stale) {
    try {
      const { effects } = await inTx((tx) => transitionInTx(tx, o.id, 'CANCELLED', { note: 'Payment not completed in time' }));
      effects();
      await refundIfNeeded(o.id); // covers a payment that was captured but not yet reconciled
      cancelled++;
    } catch {
      /* it may have just been paid; skip */
    }
  }
  return { cancelled };
}
