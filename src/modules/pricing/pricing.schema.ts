import { z } from 'zod';

export const orderTypeSchema = z.enum(['DELIVERY', 'TAKEAWAY', 'DINE_IN']);

/** The client only ever sends WHAT was chosen – never prices. */
export const cartLineSchema = z.object({
  menuItemId: z.string().min(1),
  variantId: z.string().min(1).optional(),
  addonIds: z.array(z.string().min(1)).max(20).default([]),
  quantity: z.number().int().min(1).max(20),
  instructions: z.string().trim().max(200).optional(),
  jain: z.boolean().optional(),
});

export const pincodeSchema = z.string().trim().regex(/^[1-9]\d{5}$/, 'Enter a valid 6-digit PIN code');

export const quoteSchema = z.object({
  type: orderTypeSchema,
  branchId: z.string().min(1).optional(),
  items: z.array(cartLineSchema).min(1, 'Your cart is empty').max(40),
  pincode: pincodeSchema.optional(),
  couponCode: z.string().trim().max(30).optional(),
});

export type CartLineInput = z.infer<typeof cartLineSchema>;
export type QuoteInput = z.infer<typeof quoteSchema>;
