import { requireRole } from '@/modules/auth/auth.guard';
import { route } from '@/shared/http/api';
import { z } from 'zod';
import { availabilitySchema, couponCreateSchema, menuItemCreateSchema, menuItemUpdateSchema } from './admin.schema';
import { createCoupon, createMenuItem, getAdminMenu, getDashboardSummary, setMenuAvailability, updateMenuItem } from './admin.service';

const idSchema = z.object({ id: z.string().min(1) });
export const adminRoutes = [
  route('GET', 'staff/summary', async () => { await requireRole('ADMIN'); return getDashboardSummary(); }),
  route('GET', 'staff/menu', async () => { await requireRole('ADMIN'); return getAdminMenu(); }),
  route('POST', 'staff/menu/items', async (ctx) => {
    const actor = await requireRole('ADMIN');
    return createMenuItem(await ctx.body(menuItemCreateSchema), actor.id);
  }),
  route('PATCH', 'staff/menu/items/:id', async (ctx) => {
    const actor = await requireRole('ADMIN');
    return updateMenuItem(idSchema.parse(ctx.params).id, await ctx.body(menuItemUpdateSchema), actor.id);
  }),
  route('PATCH', 'staff/menu/items/:id/availability', async (ctx) => {
    const actor = await requireRole('ADMIN');
    return setMenuAvailability(idSchema.parse(ctx.params).id, await ctx.body(availabilitySchema), actor.id);
  }),
  route('POST', 'staff/coupons', async (ctx) => {
    const actor = await requireRole('ADMIN');
    const input = await ctx.body(couponCreateSchema);
    return createCoupon({ ...input, validFrom: new Date(input.validFrom), validUntil: new Date(input.validUntil) }, actor.id);
  }),
];
