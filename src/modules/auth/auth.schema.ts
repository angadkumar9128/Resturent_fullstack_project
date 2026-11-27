import { z } from 'zod';
import { phoneSchema } from '@/shared/utils/phone';

export const otpSendSchema = z.object({ phone: phoneSchema });

export const otpLoginSchema = z.object({
  phone: phoneSchema,
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});

export const passwordLoginSchema = z.object({
  email: z.string().trim().toLowerCase().email('Enter a valid email'),
  password: z.string().min(8, 'Password must be at least 8 characters').max(100),
});

export const codSendSchema = z.object({ orderId: z.string().min(1) });
export const codVerifySchema = z.object({
  orderId: z.string().min(1),
  code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code'),
});
