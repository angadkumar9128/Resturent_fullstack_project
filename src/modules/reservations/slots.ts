/** Pure helpers for the reservation time grid. Slots sit on a fixed grid so equal start == overlap. */

export function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
}

export function fromMinutes(total: number): string {
  const h = Math.floor(total / 60);
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/**
 * e.g. open 11:00, close 23:00, 90-min slots →
 * 11:00, 12:30, 14:00, 15:30, 17:00, 18:30, 20:00, 21:30
 * A slot is only offered if it finishes by closing time.
 */
export function generateSlots(openTime: string, closeTime: string, slotMinutes: number): string[] {
  const open = toMinutes(openTime);
  const close = toMinutes(closeTime);
  const out: string[] = [];
  if (slotMinutes <= 0) return out;
  for (let t = open; t + slotMinutes <= close; t += slotMinutes) out.push(fromMinutes(t));
  return out;
}
