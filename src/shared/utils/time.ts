/** Restaurant time is always India Standard Time (UTC+05:30, no DST). */
const IST_OFFSET = '+05:30';

/** Build a UTC Date from an IST calendar date (YYYY-MM-DD) and clock time (HH:mm). */
export function istToDate(date: string, time: string): Date {
  return new Date(`${date}T${time}:00${IST_OFFSET}`);
}

/** YYYY-MM-DD of an instant as seen in India. */
export function istDateKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(d);
}

export function todayIST(): string {
  return istDateKey(new Date());
}

export function addDaysIST(dateKey: string, days: number): string {
  const d = istToDate(dateKey, '12:00');
  d.setUTCDate(d.getUTCDate() + days);
  return istDateKey(d);
}

export function formatIST(d: Date | string, withDate = true): string {
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    ...(withDate ? { day: 'numeric', month: 'short', year: 'numeric' } : {}),
  }).format(typeof d === 'string' ? new Date(d) : d);
}
