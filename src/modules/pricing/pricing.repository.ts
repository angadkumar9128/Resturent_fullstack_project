import type { Db } from '@/shared/db/prisma';

export const pricingRepository = {
  branch(db: Db, id: string) {
    return db.branch.findUnique({ where: { id } });
  },

  items(db: Db, ids: string[], branchId: string) {
    return db.menuItem.findMany({
      where: { id: { in: ids }, isActive: true },
      include: {
        variants: true,
        addonGroups: { include: { addons: true } },
        availability: { where: { branchId } },
      },
    });
  },

  zone(db: Db, branchId: string, pincode: string) {
    return db.deliveryZone.findUnique({ where: { branchId_pincode: { branchId, pincode } } });
  },

  coupon(db: Db, code: string) {
    return db.coupon.findUnique({ where: { code } });
  },

  userRedemptions(db: Db, couponId: string, userId: string) {
    return db.couponRedemption.count({ where: { couponId, userId } });
  },
};
