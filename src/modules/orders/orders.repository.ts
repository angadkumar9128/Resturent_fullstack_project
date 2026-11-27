import type { Prisma } from '@prisma/client';
import { prisma, type Db } from '@/shared/db/prisma';

export const orderInclude = {
  items: true,
  events: { orderBy: { createdAt: 'asc' } },
  payments: { select: { id: true, method: true, status: true, amountPaise: true, provider: true } },
  table: { select: { code: true } },
  branch: { select: { name: true, phone: true } },
} satisfies Prisma.OrderInclude;

export type OrderWithRelations = Prisma.OrderGetPayload<{ include: typeof orderInclude }>;

export const ordersRepository = {
  findById(db: Db, id: string) {
    return db.order.findUnique({ where: { id }, include: orderInclude });
  },

  listForUser(userId: string) {
    return prisma.order.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { items: true, branch: { select: { name: true } } },
    });
  },

  listActiveForStaff() {
    return prisma.order.findMany({
      where: { status: { in: ['PLACED', 'ACCEPTED', 'PREPARING', 'READY'] } },
      orderBy: { placedAt: 'asc' },
      include: orderInclude,
    });
  },

  listAllForStaff(limit: number) {
    return prisma.order.findMany({
      where: { status: { not: 'PENDING_PAYMENT' } },
      orderBy: { createdAt: 'desc' },
      take: limit,
      include: orderInclude,
    });
  },

  /** Atomic conditional decrement: returns false if there is not enough stock (no oversell). */
  async decrementStock(db: Db, branchId: string, itemId: string, qty: number): Promise<boolean> {
    const res = await db.branchMenuItem.updateMany({
      where: { branchId, itemId, stockQty: { gte: qty } },
      data: { stockQty: { decrement: qty } },
    });
    return res.count === 1;
  },

  async restoreStock(db: Db, branchId: string, itemId: string, qty: number) {
    await db.branchMenuItem.updateMany({
      where: { branchId, itemId, stockQty: { not: null } },
      data: { stockQty: { increment: qty } },
    });
  },

  /**
   * Row-level lock on the coupon (SELECT … FOR UPDATE) so concurrent checkouts can never exceed usageLimit.
   * Must run inside a transaction.
   */
  async lockAndConsumeCoupon(db: Db, couponId: string): Promise<boolean> {
    const rows = await db.$queryRaw<{ usedCount: number; usageLimit: number | null }[]>`
      SELECT "usedCount", "usageLimit" FROM "Coupon" WHERE "id" = ${couponId} FOR UPDATE`;
    const row = rows[0];
    if (!row) return false;
    if (row.usageLimit != null && row.usedCount >= row.usageLimit) return false;
    await db.coupon.update({ where: { id: couponId }, data: { usedCount: { increment: 1 } } });
    return true;
  },

  async releaseCoupon(db: Db, orderId: string) {
    const red = await db.couponRedemption.findUnique({ where: { orderId } });
    if (!red) return;
    await db.couponRedemption.delete({ where: { orderId } });
    await db.coupon.update({ where: { id: red.couponId }, data: { usedCount: { decrement: 1 } } });
  },

  openBillRequests() {
    return prisma.billRequest.findMany({
      where: { status: 'OPEN' },
      orderBy: { createdAt: 'asc' },
      include: { table: { select: { code: true, branch: { select: { name: true } } } } },
    });
  },
};
