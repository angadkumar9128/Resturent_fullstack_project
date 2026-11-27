import { env } from '@/shared/config/env';
import { prisma } from '@/shared/db/prisma';
import { escapeHtml } from '@/shared/security/sanitize';
import { formatIST } from '@/shared/utils/time';
import { formatINR } from '@/shared/utils/money';

type Channel = 'SMS' | 'WHATSAPP' | 'EMAIL';
interface LogCtx {
  template: string;
  entityType?: string;
  entityId?: string;
}

async function log(channel: Channel, recipient: string, ctx: LogCtx, status: 'SENT' | 'FAILED', error?: string) {
  try {
    await prisma.notificationLog.create({
      data: { channel, recipient, template: ctx.template, entityType: ctx.entityType, entityId: ctx.entityId, status, error },
    });
  } catch {
    /* logging must never break the flow */
  }
}

function twilioAuth() {
  return 'Basic ' + Buffer.from(`${env.TWILIO_ACCOUNT_SID}:${env.TWILIO_AUTH_TOKEN}`).toString('base64');
}

async function twilioSend(to: string, from: string, body: string) {
  const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: 'POST',
    headers: { Authorization: twilioAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ To: to, From: from, Body: body }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Twilio ${res.status}: ${(await res.text()).slice(0, 200)}`);
}

/** OTP delivery. console = printed in the server terminal (development only). */
export async function sendOtpSms(phone: string, code: string): Promise<void> {
  const provider = env.OTP_PROVIDER;
  if (provider === 'msg91') {
    if (!env.MSG91_AUTH_KEY || !env.MSG91_TEMPLATE_ID) throw new Error('MSG91 is not configured');
    const url = new URL('https://control.msg91.com/api/v5/otp');
    url.searchParams.set('template_id', env.MSG91_TEMPLATE_ID);
    url.searchParams.set('mobile', phone.replace('+', ''));
    url.searchParams.set('authkey', env.MSG91_AUTH_KEY);
    url.searchParams.set('otp', code);
    const res = await fetch(url, { method: 'POST', signal: AbortSignal.timeout(10_000) });
    if (!res.ok) throw new Error(`MSG91 ${res.status}`);
    return;
  }
  if (provider === 'twilio') {
    if (!env.TWILIO_FROM) throw new Error('TWILIO_FROM is not configured');
    await twilioSend(phone, env.TWILIO_FROM, `Your Spice Garden verification code is ${code}. Valid for 5 minutes.`);
    return;
  }
  console.log(`\n[DEV OTP] ${phone} -> ${code}\n`);
}

export async function sendSms(to: string, body: string, ctx: LogCtx) {
  try {
    if (env.OTP_PROVIDER === 'twilio' && env.TWILIO_FROM) {
      await twilioSend(to, env.TWILIO_FROM, body);
    } else {
      // MSG91 transactional SMS needs DLT-approved templates; wire a Flow template here when you have them.
      console.log(`[SMS -> ${to}] ${body}`);
    }
    await log('SMS', to, ctx, 'SENT');
  } catch (e) {
    await log('SMS', to, ctx, 'FAILED', (e as Error).message);
  }
}

export async function sendWhatsApp(to: string, body: string, ctx: LogCtx) {
  try {
    if (env.OTP_PROVIDER === 'twilio' && env.TWILIO_WHATSAPP_FROM) {
      await twilioSend(`whatsapp:${to}`, `whatsapp:${env.TWILIO_WHATSAPP_FROM}`, body);
    } else {
      console.log(`[WHATSAPP -> ${to}] ${body}`);
    }
    await log('WHATSAPP', to, ctx, 'SENT');
  } catch (e) {
    await log('WHATSAPP', to, ctx, 'FAILED', (e as Error).message);
  }
}

export async function sendEmail(to: string, subject: string, html: string, ctx: LogCtx) {
  try {
    if (env.EMAIL_PROVIDER === 'resend' && env.RESEND_API_KEY) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ from: env.EMAIL_FROM, to, subject, html }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) throw new Error(`Resend ${res.status}`);
    } else {
      console.log(`[EMAIL -> ${to}] ${subject}`);
    }
    await log('EMAIL', to, ctx, 'SENT');
  } catch (e) {
    await log('EMAIL', to, ctx, 'FAILED', (e as Error).message);
  }
}

// ---------------------------------------------------------------------------
// Business notifications – always fire-and-forget (never block or fail a request)
// ---------------------------------------------------------------------------

export function notifyReservationConfirmed(r: {
  id: string;
  confirmationCode: string;
  name: string;
  phone: string;
  email: string | null;
  partySize: number;
  slotStart: Date;
  branchName: string;
}) {
  const when = `${formatIST(r.slotStart)}`;
  const text = `Hi ${r.name}, your table for ${r.partySize} at ${r.branchName} is confirmed for ${when}. Code: ${r.confirmationCode}.`;
  const ctx = { template: 'reservation.confirmed', entityType: 'reservation', entityId: r.id };
  void sendSms(r.phone, text, ctx);
  void sendWhatsApp(r.phone, text, ctx);
  if (r.email) {
    void sendEmail(
      r.email,
      `Table confirmed – ${r.confirmationCode}`,
      `<p>Hi ${escapeHtml(r.name)},</p><p>Your table for <b>${r.partySize}</b> at <b>${escapeHtml(r.branchName)}</b> is confirmed for <b>${escapeHtml(when)}</b>.</p><p>Confirmation code: <b>${r.confirmationCode}</b></p>`,
      ctx,
    );
  }
}

export function notifyOrderStatus(o: {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string | null;
  status: string;
  totalPaise: number;
}) {
  const msgs: Record<string, string> = {
    PLACED: `Thanks ${o.customerName}! Order ${o.orderNumber} (${formatINR(o.totalPaise)}) is placed.`,
    ACCEPTED: `Order ${o.orderNumber} has been accepted by the kitchen.`,
    PREPARING: `Order ${o.orderNumber} is being prepared.`,
    OUT_FOR_DELIVERY: `Order ${o.orderNumber} is out for delivery.`,
    DELIVERED: `Order ${o.orderNumber} has been delivered. Enjoy your meal!`,
    CANCELLED: `Order ${o.orderNumber} was cancelled. Any online payment will be refunded to the original method.`,
  };
  const text = msgs[o.status];
  if (!text) return;
  const ctx = { template: `order.${o.status.toLowerCase()}`, entityType: 'order', entityId: o.id };
  void sendSms(o.customerPhone, text, ctx);
  if (o.status === 'PLACED' && o.customerEmail) {
    void sendEmail(o.customerEmail, `Order ${o.orderNumber} confirmed`, `<p>${escapeHtml(text)}</p>`, ctx);
  }
}
