import { z } from 'zod';

export const menuItemCreateSchema = z.object({
  categoryId: z.string().min(1),
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().min(2).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
  description: z.string().trim().max(500).optional(),
  imageUrl: z.string().url().optional().or(z.literal('')),
  diet: z.enum(['VEG', 'NON_VEG', 'EGG']),
  jainAvailable: z.boolean().default(false),
  spiceLevel: z.enum(['NONE', 'MILD', 'MEDIUM', 'SPICY']).default('NONE'),
  allergens: z.array(z.enum(['GLUTEN','DAIRY','NUTS','PEANUTS','SOY','EGG','FISH','SHELLFISH','SESAME','MUSTARD'])).default([]),
  basePricePaise: z.number().int().min(0).max(10_000_000),
  isBestseller: z.boolean().default(false),
});
export const menuItemUpdateSchema = menuItemCreateSchema.partial().omit({ slug: true });
export const availabilitySchema = z.object({
  branchId: z.string().min(1),
  isAvailable: z.boolean(),
  stockQty: z.number().int().min(0).nullable().optional(),
});
export const couponCreateSchema = z.object({
  code: z.string().trim().min(3).max(30).transform(v => v.toUpperCase()),
  description: z.string().trim().max(200).optional(),
  discountType: z.enum(['FLAT', 'PERCENT']),
  value: z.number().int().positive(),
  maxDiscountPaise: z.number().int().positive().optional(),
  minOrderPaise: z.number().int().min(0).default(0),
  usageLimit: z.number().int().positive().optional(),
  validFrom: z.string().datetime(),
  validUntil: z.string().datetime(),
});
