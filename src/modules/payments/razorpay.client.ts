import { env } from '@/shared/config/env';
import { AppError } from '@/shared/errors/app-error';

const BASE = 'https://api.razorpay.com/v1';

export function razorpayConfigured(): boolean {
  return Boolean(env.RAZORPAY_KEY_ID && env.RAZORPAY_KEY_SECRET);
}

function authHeader(): string {
  if (!razorpayConfigured()) {
    throw new AppError(503, 'PAYMENTS_UNAVAILABLE', 'Online payments are not configured yet. Please choose another payment method.');
  }
  return 'Basic ' + Buffer.from(`${env.RAZORPAY_KEY_ID}:${env.RAZORPAY_KEY_SECRET}`).toString('base64');
}

async function call<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    console.error('Razorpay error', res.status, (await res.text()).slice(0, 500));
    throw new AppError(502, 'GATEWAY_ERROR', 'The payment gateway could not process this request. Please try again.');
  }
  return (await res.json()) as T;
}

export function createRazorpayOrder(args: { amountPaise: number; receipt: string; notes?: Record<string, string> }) {
  return call<{ id: string; amount: number; currency: string }>('/orders', {
    amount: args.amountPaise,
    currency: 'INR',
    receipt: args.receipt.slice(0, 40),
    notes: args.notes,
  });
}

export function refundRazorpayPayment(paymentId: string, amountPaise: number) {
  return call<{ id: string; status: string }>(`/payments/${paymentId}/refund`, { amount: amountPaise });
}
