import type { ReservationStatus } from '@prisma/client';
import { inTx, Prisma } from '@/shared/db/prisma';
import { E } from '@/shared/errors/app-error';
import { rateLimit } from '@/shared/security/rate-limit';
import { cleanOptional, cleanText } from '@/shared/security/sanitize';
import { randomCode } from '@/shared/utils/ids';
import { addDaysIST, istToDate, todayIST } from '@/shared/utils/time';
import type { SessionUser } from '@/modules/auth/auth.guard';
import { notifyReservationConfirmed } from '@/modules/notifications/notifications.service';
import { reservationsRepository as repo } from './reservations.repository';
import type { CreateReservationInput } from './reservations.schema';
import { generateSlots } from './slots';

const MIN_LEAD_MS = 30 * 60_000;
const MAX_DAYS_AHEAD = 60;
const MAX_UPCOMING_PER_PHONE = 3;

function toDto(r: {
  id: string;
  confirmationCode: string;
  status: string;
  name: string;
  phone: string;
  partySize: number;
  slotStart: Date;
  slotEnd: Date;
  occasion: string;
  specialRequests: string | null;
  branch: { name: string };
  slotLocks: { table: { code: string } }[];
}) {
  return {
    id: r.id,
    confirmationCode: r.confirmationCode,
    status: r.status,
    name: r.name,
    phone: r.phone,
    partySize: r.partySize,
    slotStart: r.slotStart,
    slotEnd: r.slotEnd,
    occasion: r.occasion,
    specialRequests: r.specialRequests,
    branchName: r.branch.name,
    tableCode: r.slotLocks[0]?.table.code ?? null,
  };
}

export async function getAvailability(q: { branchId: string; date: string; partySize: number }) {
  const branch = await repo.branch(q.branchId);
  if (!branch) throw E.notFound('Branch not found');

  const slots = generateSlots(branch.openTime, branch.closeTime, branch.slotMinutes);
  const tables = (await repo.activeTables(branch.id)).filter((t) => t.seats >= q.partySize);
  const dayStart = istToDate(q.date, '00:00');
  const locks = await repo.locksBetween(branch.id, dayStart, new Date(dayStart.getTime() + 86_400_000));
  const earliest = Date.now() + MIN_LEAD_MS;

  return {
    branch: { id: branch.id, name: branch.name, slotMinutes: branch.slotMinutes },
    slots: slots.map((time) => {
      const start = istToDate(q.date, time);
      const taken = new Set(locks.filter((l) => l.slotStart.getTime() === start.getTime()).map((l) => l.tableId));
      const free = tables.filter((t) => !taken.has(t.id)).length;
      return { time, tablesLeft: free, available: free > 0 && start.getTime() >= earliest };
    }),
  };
}

export async function bookTable(input: CreateReservationInput, user: SessionUser | null, ip: string) {
  await rateLimit(`resv:ip:${ip}`, 8, 3600, 'Too many booking attempts. Please try again later.');
  await rateLimit(`resv:phone:${input.phone}`, 5, 86_400, 'Too many bookings for this number today.');

  const branch = await repo.branch(input.branchId);
  if (!branch) throw E.notFound('Branch not found');

  const validTimes = generateSlots(branch.openTime, branch.closeTime, branch.slotMinutes);
  if (!validTimes.includes(input.time)) throw E.badRequest('Please pick one of the available time slots');

  const slotStart = istToDate(input.date, input.time);
  if (slotStart.getTime() < Date.now() + MIN_LEAD_MS) throw E.unprocessable('Please choose a time at least 30 minutes from now');
  if (input.date > addDaysIST(todayIST(), MAX_DAYS_AHEAD)) throw E.unprocessable(`Bookings open up to ${MAX_DAYS_AHEAD} days ahead`);

  if ((await repo.countUpcomingByPhone(input.phone)) >= MAX_UPCOMING_PER_PHONE) {
    throw E.unprocessable('You already have several upcoming reservations. Please cancel one or call us.');
  }

  const fitting = (await repo.activeTables(branch.id)).filter((t) => t.seats >= input.partySize); // smallest fitting table first
  if (fitting.length === 0) throw E.unprocessable('We cannot seat a party this large online. Please call the restaurant.');

  const taken = new Set(await repo.lockedTableIdsAt(branch.id, slotStart));
  const candidates = fitting.filter((t) => !taken.has(t.id));
  const slotEnd = new Date(slotStart.getTime() + branch.slotMinutes * 60_000);

  for (const table of candidates) {
    try {
      const created = await repo.createWithLock(
        {
          confirmationCode: `SG${randomCode(4)}`,
          userId: user?.id,
          branchId: branch.id,
          name: cleanText(input.name, 80),
          phone: input.phone,
          email: input.email || null,
          partySize: input.partySize,
          slotStart,
          slotEnd,
          occasion: input.occasion,
          specialRequests: cleanOptional(input.specialRequests, 300),
          status: 'CONFIRMED',
        },
        table.id,
      );
      notifyReservationConfirmed({
        id: created.id,
        confirmationCode: created.confirmationCode,
        name: created.name,
        phone: created.phone,
        email: created.email,
        partySize: created.partySize,
        slotStart: created.slotStart,
        branchName: created.branch.name,
      });
      return toDto(created);
    } catch (e) {
      // Another request grabbed this table between our check and insert → try the next table.
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') continue;
      throw e;
    }
  }
  throw E.conflict('Sorry, that time slot was just taken. Please choose another time.');
}

export async function cancelByCode(code: string, phone: string) {
  const r = await repo.findByCodeAndPhone(code, phone);
  if (!r) throw E.notFound('No reservation found for that code and phone number');
  if (r.status !== 'PENDING' && r.status !== 'CONFIRMED') throw E.conflict('This reservation can no longer be cancelled');
  if (r.slotStart.getTime() < Date.now()) throw E.conflict('This reservation is in the past');
  const updated = await inTx((tx) => repo.setStatus(tx, r.id, 'CANCELLED'));
  return toDto(updated);
}

export async function listForDate(date: string) {
  const start = istToDate(date, '00:00');
  const rows = await repo.listForDay(start, new Date(start.getTime() + 86_400_000));
  return rows.map(toDto);
}

export async function adminSetStatus(id: string, status: ReservationStatus) {
  const updated = await inTx((tx) => repo.setStatus(tx, id, status));
  return toDto(updated);
}
