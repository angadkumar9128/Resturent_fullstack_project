import { revalidateTag } from 'next/cache';
import type { Prisma } from '@prisma/client';
import { E } from '@/shared/errors/app-error';
import { prisma } from '@/shared/db/prisma';
import { adminRepository as repo } from './admin.repository';

function istDayRange(date = new Date()) {
  const local = new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  local.setHours(0, 0, 0, 0);
  const offset = date.getTime() - new Date(date.toLocaleString('en-US', { timeZone: 'Asia/Kolkata' })).getTime();
  const from = new Date(local.getTime() + offset);
  return { from, to: new Date(from.getTime() + 86_400_000) };
}

export async function getDashboardSummary() {
  const { from, to } = istDayRange();
  return repo.summary(from, to);
}

export async function getAdminMenu() { return repo.menu(); }

export async function createMenuItem(input: Parameters<typeof repo.createMenuItem>[0], actorId: string) {
  const category = await prisma.menuCategory.findUnique({ where: { id: input.categoryId } });
  if (!category) throw E.notFound('Menu category not found');
  const item = await repo.createMenuItem(input);
  await prisma.auditLog.create({ data: { actorId, action: 'menu.create', entityType: 'MenuItem', entityId: item.id } });
  revalidateTag('menu');
  return item;
}

export async function updateMenuItem(id: string, input: Prisma.MenuItemUncheckedUpdateInput, actorId: string) {
  const item = await repo.updateMenuItem(id, input);
  await prisma.auditLog.create({ data: { actorId, action: 'menu.update', entityType: 'MenuItem', entityId: item.id, diff: input as Prisma.InputJsonValue } });
  revalidateTag('menu');
  return item;
}

export async function setMenuAvailability(id: string, input: { branchId: string; isAvailable: boolean; stockQty?: number | null }, actorId: string) {
  const item = await prisma.menuItem.findUnique({ where: { id }, select: { id: true } });
  if (!item) throw E.notFound('Menu item not found');
  const result = await repo.setAvailability(id, input.branchId, input.isAvailable, input.stockQty);
  await prisma.auditLog.create({ data: { actorId, action: 'menu.availability', entityType: 'MenuItem', entityId: id, diff: input } });
  revalidateTag('menu');
  return result;
}

export async function createCoupon(input: Parameters<typeof repo.createCoupon>[0], actorId: string) {
  if (input.validUntil <= input.validFrom) throw E.badRequest('Coupon end date must be after start date');
  const coupon = await repo.createCoupon(input);
  await prisma.auditLog.create({ data: { actorId, action: 'coupon.create', entityType: 'Coupon', entityId: coupon.id } });
  return coupon;
}
