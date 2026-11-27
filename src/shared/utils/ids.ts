import { randomInt } from 'crypto';

const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no 0/O/1/I to avoid confusion on phone

export function randomCode(length: number): string {
  let out = '';
  for (let i = 0; i < length; i++) out += ALPHABET[randomInt(0, ALPHABET.length)];
  return out;
}

/** e.g. SG-250915-K7M2Q – human friendly, unique constraint in DB is the final guard. */
export function newOrderNumber(): string {
  const d = new Date(Date.now() + 5.5 * 3600_000);
  const yymmdd = d.toISOString().slice(2, 10).replace(/-/g, '');
  return `SG-${yymmdd}-${randomCode(5)}`;
}

export function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}
