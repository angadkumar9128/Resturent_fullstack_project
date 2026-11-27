import type { NextRequest } from 'next/server';
import { authRoutes } from '@/modules/auth/auth.controller';
import { menuRoutes } from '@/modules/menu/menu.controller';
import { orderRoutes } from '@/modules/orders/orders.controller';
import { paymentRoutes } from '@/modules/payments/payments.controller';
import { pricingRoutes } from '@/modules/pricing/pricing.controller';
import { reservationRoutes } from '@/modules/reservations/reservations.controller';
import { adminRoutes } from '@/modules/admin/admin.controller';
import { dispatch, type Method } from '@/shared/http/api';

const routes = [...authRoutes, ...menuRoutes, ...pricingRoutes, ...orderRoutes, ...paymentRoutes, ...reservationRoutes, ...adminRoutes];

type RouteContext = { params: Promise<{ path?: string[] }> };
async function handle(req: NextRequest, context: RouteContext) {
  const { path = [] } = await context.params;
  return dispatch(routes, req, path);
}

export const GET = (req: NextRequest, context: RouteContext) => handle(req, context);
export const POST = (req: NextRequest, context: RouteContext) => handle(req, context);
export const PATCH = (req: NextRequest, context: RouteContext) => handle(req, context);
export const PUT = (req: NextRequest, context: RouteContext) => handle(req, context);
export const DELETE = (req: NextRequest, context: RouteContext) => handle(req, context);
