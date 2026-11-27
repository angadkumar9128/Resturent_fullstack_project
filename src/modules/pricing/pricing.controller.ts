import { prisma } from '@/shared/db/prisma';
import { route } from '@/shared/http/api';
import { rateLimit } from '@/shared/security/rate-limit';
import { getSessionUser } from '@/modules/auth/auth.guard';
import { resolveBranchId } from '@/modules/menu/menu.service';
import { quoteSchema } from './pricing.schema';
import { priceCart } from './pricing.service';

export const pricingRoutes = [
  // Server-calculated totals for the cart/checkout UI (never trust client math).
  route('POST', 'pricing/quote', async (ctx) => {
    await rateLimit(`quote:${ctx.ip}`, 120, 60);
    const input = await ctx.body(quoteSchema);
    const user = await getSessionUser();
    const branchId = await resolveBranchId(input.branchId);
    const priced = await priceCart({
      db: prisma,
      branchId,
      type: input.type,
      lines: input.items,
      pincode: input.pincode,
      couponCode: input.couponCode,
      userId: user?.id,
    });
    return {
      branchId,
      lines: priced.lines.map((l) => ({
        menuItemId: l.menuItemId,
        name: l.name,
        variantName: l.variantName,
        quantity: l.quantity,
        lineTotalPaise: l.lineTotalPaise,
      })),
      pricing: priced.pricing,
      delivery: priced.delivery,
      coupon: priced.coupon ? { code: priced.coupon.code, description: priced.coupon.description } : null,
    };
  }),
];
