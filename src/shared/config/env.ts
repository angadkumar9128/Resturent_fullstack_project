import { z } from 'zod';

// Empty strings in .env files are treated as "not set".
const blank = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const opt = () => z.preprocess(blank, z.string().optional());

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),
  AUTH_SECRET: z.string().min(16, 'AUTH_SECRET must be at least 16 characters'),
  NEXT_PUBLIC_APP_URL: z.preprocess(blank, z.string().url().default('http://localhost:3000')),

  AUTH_GOOGLE_ID: opt(),
  AUTH_GOOGLE_SECRET: opt(),

  OTP_PROVIDER: z.preprocess(blank, z.enum(['console', 'msg91', 'twilio']).default('console')),
  MSG91_AUTH_KEY: opt(),
  MSG91_TEMPLATE_ID: opt(),
  TWILIO_ACCOUNT_SID: opt(),
  TWILIO_AUTH_TOKEN: opt(),
  TWILIO_FROM: opt(),
  TWILIO_WHATSAPP_FROM: opt(),

  EMAIL_PROVIDER: z.preprocess(blank, z.enum(['console', 'resend']).default('console')),
  RESEND_API_KEY: opt(),
  EMAIL_FROM: z.preprocess(blank, z.string().default('Spice Garden <orders@example.com>')),

  RAZORPAY_KEY_ID: opt(),
  RAZORPAY_KEY_SECRET: opt(),
  RAZORPAY_WEBHOOK_SECRET: opt(),

  // Bearer token for scheduled jobs (e.g. Vercel Cron) – optional
  CRON_SECRET: opt(),
});

export type Env = z.infer<typeof schema>;

let cached: Env | undefined;

export function getEnv(): Env {
  if (!cached) {
    const parsed = schema.safeParse(process.env);
    if (!parsed.success) {
      const lines = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`);
      throw new Error(`Invalid environment configuration:\n${lines.join('\n')}`);
    }
    cached = parsed.data;
  }
  return cached;
}

// Lazy proxy: validation happens on first access, not at import time (keeps `next build` happy).
export const env = new Proxy({} as Env, {
  get: (_t, key: string) => getEnv()[key as keyof Env],
});
