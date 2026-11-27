import { prisma } from '@/shared/db/prisma';

export const adminRepository = {
  async summary(from: Date, to: Date) {
    const [orders, revenue, reservations, customers, activeMenu] = await Promise.all([
      prisma.order.groupBy({ by: ['status'], where: { createdAt: { gte: from, lt: to } }, _count: { _all: true } }),
      prisma.order.aggregate({ where: { createdAt: { gte: from, lt: to }, status: { in: ['PLACED','ACCEPTED','PREPARING','READY','OUT_FOR_DELIVERY','DELIVERED','COMPLETED'] } }, _sum: { totalPaise: true }, _count: { _all: true } }),
      prisma.reservation.count({ where: { slotStart: { gte: from, lt: to }, status: { in: ['PENDING','CONFIRMED','SEATED'] } } }),
      prisma.user.count({ where: { createdAt: { gte: from, lt: to } } }),
      prisma.menuItem.count({ where: { isActive: true } }),
    ]);
    return { orders: orders.map(x => ({ status: x.status, count: x._count._all })), revenuePaise: revenue._sum.totalPaise ?? 0, paidOrPlacedOrders: revenue._count._all, reservations, newCustomers: customers, activeMenuItems: activeMenu };
  },
  menu() {
    return prisma.menuCategory.findMany({ orderBy: { sortOrder: 'asc' }, include: { items: { orderBy: { sortOrder: 'asc' }, include: { variants: true, addonGroups: { include: { addons: true } }, availability: true } } } });
  },
  createMenuItem(data: { categoryId: string; name: string; slug: string; description?: string; imageUrl?: string; diet: 'VEG'|'NON_VEG'|'EGG'; jainAvailable: boolean; spiceLevel: 'NONE'|'MILD'|'MEDIUM'|'SPICY'; allergens: ('GLUTEN'|'DAIRY'|'NUTS'|'PEANUTS'|'SOY'|'EGG'|'FISH'|'SHELLFISH'|'SESAME'|'MUSTARD')[]; basePricePaise: number; isBestseller: boolean }) {
    return prisma.menuItem.create({ data: { ...data, description: data.description || null, imageUrl: data.imageUrl || null } });
  },
  updateMenuItem(id: string, data: Record<string, unknown>) {
    return prisma.menuItem.update({ where: { id }, data });
  },
  async setAvailability(itemId: string, branchId: string, isAvailable: boolean, stockQty?: number | null) {
    return prisma.branchMenuItem.upsert({
      where: { branchId_itemId: { branchId, itemId } },
      create: { branchId, itemId, isAvailable, stockQty: stockQty ?? null },
      update: { isAvailable, ...(stockQty !== undefined ? { stockQty } : {}) },
    });
  },
  createCoupon(data: { code: string; description?: string; discountType: 'FLAT'|'PERCENT'; value: number; maxDiscountPaise?: number; minOrderPaise: number; usageLimit?: number; validFrom: Date; validUntil: Date }) {
    return prisma.coupon.create({ data: { ...data, description: data.description || null } });
  },
};
