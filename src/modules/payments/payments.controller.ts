import { z } from 'zod';
import { env } from '@/shared/config/env';
import { E } from '@/shared/errors/app-error';
import { route } from '@/shared/http/api';
import { rateLimit } from '@/shared/security/rate-limit';
import { codSendSchema, codVerifySchema } from '@/modules/auth/auth.schema';
import { getSessionUser, requireUser } from '@/modules/auth/auth.guard';
import { expireStalePendingOrders, handleWebhook, initiateOnline, sendCodOtp, verifyAndCapture, verifyCodOtp } from './payments.service';

const initiateSchema = z.object({ orderId: z.string().min(1) });
const verifySchema = z.object({
  orderId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
});

export const paymentRoutes = [
  route('POST', 'payments/razorpay/order', async (ctx) => {
    await rateLimit(`pay-init:${ctx.ip}`, 20, 60);
    const { orderId } = await ctx.body(initiateSchema);
    return initiateOnline(orderId, await getSessionUser());
  }),

  route('POST', 'payments/razorpay/verify', async (ctx) => {
    await rateLimit(`pay-verify:${ctx.ip}`, 30, 60);
    const b = await ctx.body(verifySchema);
    return verifyAndCapture(
      { orderId: b.orderId, razorpayOrderId: b.razorpay_order_id, razorpayPaymentId: b.razorpay_payment_id, razorpaySignature: b.razorpay_signature },
      await getSessionUser(),
    );
  }),

  // Called by Razorpay servers (no cookies/Origin) – authenticated by HMAC signature instead.
  route(
    'POST',
    'payments/razorpay/webhook',
    async (ctx) => {
      const raw = await ctx.req.text(); // raw body is required for signature verification
      return handleWebhook(raw, ctx.req.headers.get('x-razorpay-signature'), ctx.req.headers.get('x-razorpay-event-id'));
    },
    { skipOrigin: true },
  ),

  route('POST', 'payments/cod/send', async (ctx) => {
    const user = await requireUser();
    const { orderId } = await ctx.body(codSendSchema);
    return sendCodOtp(orderId, user, ctx.ip);
  }),

  route('POST', 'payments/cod/verify', async (ctx) => {
    const user = await requireUser();
    await rateLimit(`cod-verify:${user.id}`, 20, 900);
    const { orderId, code } = await ctx.body(codVerifySchema);
    return verifyCodOtp(orderId, code, user);
  }),

  // Scheduled housekeeping (Vercel Cron / external cron): GET with `Authorization: Bearer $CRON_SECRET`
  route('GET', 'jobs/expire-pending', async (ctx) => {
    const secret = env.CRON_SECRET;
    if (!secret || ctx.req.headers.get('authorization') !== `Bearer ${secret}`) throw E.unauthorized();
    return expireStalePendingOrders(30);
  }),
];
