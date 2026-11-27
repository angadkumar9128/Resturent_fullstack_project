import type { Prisma, ReservationStatus } from '@prisma/client';
import { prisma, type Db } from '@/shared/db/prisma';

export const reservationsRepository = {
  branch(id: string) {
    return prisma.branch.findFirst({ where: { id, isActive: true, acceptsDineIn: true } });
  },

  activeTables(branchId: string) {
    return prisma.diningTable.findMany({ where: { branchId, isActive: true }, orderBy: [{ seats: 'asc' }, { code: 'asc' }] });
  },

  locksBetween(branchId: string, from: Date, to: Date) {
    return prisma.reservationSlotLock.findMany({
      where: { table: { branchId }, slotStart: { gte: from, lt: to } },
      select: { tableId: true, slotStart: true },
    });
  },

  lockedTableIdsAt(branchId: string, slotStart: Date) {
    return prisma.reservationSlotLock
      .findMany({ where: { table: { branchId }, slotStart }, select: { tableId: true } })
      .then((rows) => rows.map((r) => r.tableId));
  },

  countUpcomingByPhone(phone: string) {
    return prisma.reservation.count({
      where: { phone, status: { in: ['PENDING', 'CONFIRMED'] }, slotStart: { gt: new Date() } },
    });
  },

  /**
   * Creates the reservation AND its slot lock in one transaction.
   * The UNIQUE(tableId, slotStart) constraint on the lock row makes double-booking impossible:
   * if two requests race for the same table, the loser fails with P2002.
   */
  createWithLock(
    data: Omit<Prisma.ReservationUncheckedCreateInput, 'slotLocks'>,
    tableId: string,
  ) {
    return prisma.$transaction(async (tx) =>
      tx.reservation.create({
        data: { ...data, slotLocks: { create: { tableId, slotStart: data.slotStart as Date } } },
        include: { branch: { select: { name: true } }, slotLocks: { include: { table: { select: { code: true } } } } },
      }),
    );
  },

  findByCodeAndPhone(code: string, phone: string) {
    return prisma.reservation.findFirst({ where: { confirmationCode: code, phone } });
  },

  listForDay(from: Date, to: Date) {
    return prisma.reservation.findMany({
      where: { slotStart: { gte: from, lt: to } },
      orderBy: { slotStart: 'asc' },
      include: { branch: { select: { name: true } }, slotLocks: { include: { table: { select: { code: true } } } } },
    });
  },

  /** Updates status; freeing the table slot for CANCELLED / NO_SHOW by deleting its lock row. */
  async setStatus(db: Db, id: string, status: ReservationStatus) {
    if (status === 'CANCELLED' || status === 'NO_SHOW') {
      await db.reservationSlotLock.deleteMany({ where: { reservationId: id } });
    }
    return db.reservation.update({
      where: { id },
      data: { status },
      include: { branch: { select: { name: true } }, slotLocks: { include: { table: { select: { code: true } } } } },
    });
  },
};
