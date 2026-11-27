import { z } from 'zod';
import { phoneSchema } from '@/shared/utils/phone';
import { orderTypeSchema, quoteSchema, pincodeSchema } from '@/modules/pricing/pricing.schema';

export const addressSchema = z.object({
  name: z.string().trim().min(2, 'Enter the receiver name').max(80),
  line1: z.string().trim().min(3, 'Enter your address').max(150),
  line2: z.string().trim().max(150).optional(),
  landmark: z.string().trim().max(100).optional(),
  city: z.string().trim().min(2, 'Enter your city').max(60),
  state: z.string().trim().min(2, 'Enter your state').max(60),
  pincode: pincodeSchema,
});

export const paymentMethodSchema = z.enum(['UPI', 'CARD', 'NETBANKING', 'WALLET', 'COD', 'PAY_AT_COUNTER']);

export const checkoutSchema = quoteSchema
  .extend({
    customer: z.object({
      name: z.string().trim().min(2, 'Enter your name').max(80),
      phone: phoneSchema,
      email: z.string().trim().email('Enter a valid email').optional().or(z.literal('')),
    }),
    address: addressSchema.optional(),
    tableToken: z.string().trim().min(1).max(128).optional(),
    paymentMethod: paymentMethodSchema,
    notes: z.string().trim().max(300).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.type === 'DELIVERY' && !v.address) {
      ctx.addIssue({ code: 'custom', path: ['address'], message: 'Delivery address is required' });
    }
    if (v.type === 'DINE_IN' && !v.tableToken) {
      ctx.addIssue({ code: 'custom', path: ['tableCode'], message: 'Table code is required for dine-in' });
    }
    if (v.paymentMethod === 'COD' && v.type !== 'DELIVERY') {
      ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Cash on delivery is only for delivery orders' });
    }
    if (v.paymentMethod === 'PAY_AT_COUNTER' && v.type === 'DELIVERY') {
      ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Pay at counter is not available for delivery' });
    }
  });

export const statusUpdateSchema = z.object({
  status: z.enum(['ACCEPTED', 'PREPARING', 'READY', 'OUT_FOR_DELIVERY', 'DELIVERED', 'COMPLETED', 'CANCELLED']),
  note: z.string().trim().max(200).optional(),
});

export const cancelSchema = z.object({ reason: z.string().trim().max(200).optional() });

export const billRequestSchema = z.object({
  tableCode: z.string().trim().min(1).max(20),
  branchId: z.string().min(1).optional(),
});

export const staffOrdersQuerySchema = z.object({
  scope: z.enum(['active', 'all']).default('active'),
  limit: z.coerce.number().int().min(1).max(200).default(100),
});

export { orderTypeSchema };
export type CheckoutInput = z.infer<typeof checkoutSchema>;
