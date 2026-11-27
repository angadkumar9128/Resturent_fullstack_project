import { requireRole, getSessionUser } from '@/modules/auth/auth.guard';
import { route } from '@/shared/http/api';
import { availabilityQuerySchema, cancelReservationSchema, createReservationSchema } from './reservations.schema';
import { adminSetStatus, bookTable, cancelByCode, getAvailability, listForDate } from './reservations.service';
import { z } from 'zod';

const staffQuery = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) });
const statusBody = z.object({ status: z.enum(['CONFIRMED', 'SEATED', 'COMPLETED', 'CANCELLED', 'NO_SHOW']) });

export const reservationRoutes = [
  route('GET', 'reservations/availability', async (ctx) => getAvailability(ctx.parseQuery(availabilityQuerySchema))),
  route('POST', 'reservations', async (ctx) => bookTable(await ctx.body(createReservationSchema), await getSessionUser(), ctx.ip)),
  route('POST', 'reservations/cancel', async (ctx) => {
    const input = await ctx.body(cancelReservationSchema);
    return cancelByCode(input.code, input.phone);
  }),
  route('GET', 'staff/reservations', async (ctx) => {
    await requireRole('ADMIN');
    const { date } = ctx.parseQuery(staffQuery);
    return listForDate(date);
  }),
  route('PATCH', 'staff/reservations/:id', async (ctx) => {
    await requireRole('ADMIN');
    const { status } = await ctx.body(statusBody);
    return adminSetStatus(ctx.params.id!, status);
  }),
];
