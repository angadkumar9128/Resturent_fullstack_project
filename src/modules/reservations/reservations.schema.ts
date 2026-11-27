import { z } from 'zod';
import { phoneSchema } from '@/shared/utils/phone';

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Pick a valid date');

export const availabilityQuerySchema = z.object({
  branchId: z.string().min(1),
  date: dateStr,
  partySize: z.coerce.number().int().min(1).max(20),
});

export const occasionSchema = z.enum(['NONE', 'BIRTHDAY', 'ANNIVERSARY', 'BUSINESS', 'OTHER']);

export const createReservationSchema = z.object({
  branchId: z.string().min(1, 'Choose a branch'),
  date: dateStr,
  time: z.string().regex(/^\d{2}:\d{2}$/, 'Pick a time slot'),
  partySize: z.number().int().min(1).max(20),
  name: z.string().trim().min(2, 'Enter your name').max(80),
  phone: phoneSchema,
  email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
  occasion: occasionSchema.default('NONE'),
  specialRequests: z.string().trim().max(300).optional(),
});

export const cancelReservationSchema = z.object({
  code: z.string().trim().toUpperCase().min(4).max(12),
  phone: phoneSchema,
});

export type CreateReservationInput = z.infer<typeof createReservationSchema>;
