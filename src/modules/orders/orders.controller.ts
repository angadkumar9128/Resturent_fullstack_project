import { AppError } from '@/shared/errors/app-error';
import { sseResponse } from '@/shared/events/bus';
import { route } from '@/shared/http/api';
import { rateLimit } from '@/shared/security/rate-limit';
import { getSessionUser, requireRole, requireUser } from '@/modules/auth/auth.guard';
import { initiateOnline, refundIfNeeded } from '@/modules/payments/payments.service';
import { razorpayConfigured } from '@/modules/payments/razorpay.client';
import {
  billRequestSchema,
  cancelSchema,
  checkoutSchema,
  staffOrdersQuerySchema,
  statusUpdateSchema,
} from './orders.schema';
import {
  cancelByCustomer,
  changeStatus,
  createOrder,
  getOrderForViewer,
  listForStaff,
  listMyOrders,
  requestBill,
  resolveBillRequest,
} from './orders.service';

export const orderRoutes = [
  // Create an order. Totals are recomputed on the server; online orders also get a gateway order.
  route('POST', 'checkout', async (ctx) => {
    await rateLimit(`checkout:${ctx.ip}`, 15, 600, 'Too many orders from your network. Please wait a few minutes.');
    const input = await ctx.body(checkoutSchema);
    const online = ['UPI', 'CARD', 'NETBANKING', 'WALLET'].includes(input.paymentMethod);
    if (online && !razorpayConfigured()) {
      throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Online payments are not available right now. Please choose another payment method.');
    }
    const user = await getSessionUser();
    const { order, next } = await createOrder(input, user);
    const payment = next === 'ONLINE_PAYMENT' ? await initiateOnline(order.id, user) : undefined;
    return { order, next, payment };
  }),

  route('GET', 'orders', async () => listMyOrders(await requireUser())),

  route('GET', 'orders/:id', async (ctx) => getOrderForViewer(ctx.params.id!, await getSessionUser())),

  route('GET', 'orders/:id/stream', async (ctx) => {
    await getOrderForViewer(ctx.params.id!, await getSessionUser()); // authorisation
    return sseResponse(ctx.req, [`order:${ctx.params.id}`]);
  }),

  route('POST', 'orders/:id/cancel', async (ctx) => {
    const user = await requireUser();
    const { reason } = await ctx.body(cancelSchema);
    const order = await cancelByCustomer(ctx.params.id!, user, reason);
    await refundIfNeeded(order.id);
    return order;
  }),

  route('POST', 'bill-requests', async (ctx) => {
    const { tableCode, branchId } = await ctx.body(billRequestSchema);
    return requestBill(tableCode, branchId, ctx.ip);
  }),

  // ---- Kitchen / admin ----
  route('GET', 'staff/orders', async (ctx) => {
    await requireRole('KITCHEN_STAFF', 'ADMIN');
    const q = ctx.parseQuery(staffOrdersQuerySchema);
    return listForStaff(q.scope, q.limit);
  }),

  route('PATCH', 'staff/orders/:id/status', async (ctx) => {
    const actor = await requireRole('KITCHEN_STAFF', 'ADMIN');
    const { status, note } = await ctx.body(statusUpdateSchema);
    const order = await changeStatus(ctx.params.id!, status, actor, note);
    if (status === 'CANCELLED') await refundIfNeeded(order.id);
    return order;
  }),

  route('GET', 'staff/stream', async (ctx) => {
    await requireRole('KITCHEN_STAFF', 'ADMIN');
    return sseResponse(ctx.req, ['staff']);
  }),

  route('POST', 'staff/bill-requests/:id/resolve', async (ctx) => {
    await requireRole('KITCHEN_STAFF', 'ADMIN');
    return resolveBillRequest(ctx.params.id!);
  }),
];
