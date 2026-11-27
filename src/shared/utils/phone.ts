import { z } from 'zod';

/** Accepts 9876543210, +91 98765 43210, 09876543210 … returns +919876543210, or null. */
export function normalizeIndianPhone(input: string): string | null {
  const digits = input.replace(/[\s\-()]/g, '');
  const m = /^(?:\+?91|0)?([6-9]\d{9})$/.exec(digits);
  return m ? `+91${m[1]}` : null;
}

export const phoneSchema = z
  .string()
  .trim()
  .transform((v, ctx) => {
    const n = normalizeIndianPhone(v);
    if (!n) {
      ctx.addIssue({ code: 'custom', message: 'Enter a valid 10-digit Indian mobile number' });
      return z.NEVER;
    }
    return n;
  });
