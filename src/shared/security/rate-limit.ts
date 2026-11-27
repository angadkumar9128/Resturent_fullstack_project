import { prisma } from '@/shared/db/prisma';
import { E } from '@/shared/errors/app-error';

/**
 * Fixed-window rate limiter backed by Postgres (atomic single-statement upsert).
 * Swap the body for Upstash/Redis when running many instances.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSec: number,
  message = 'Too many requests, please try again later',
) {
  const rows = await prisma.$queryRaw<{ count: number }[]>`
    INSERT INTO "RateLimitBucket" ("key", "count", "windowStart")
    VALUES (${key}, 1, timezone('utc', now()))
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE
        WHEN "RateLimitBucket"."windowStart" < timezone('utc', now()) - (${windowSec}::float8 * interval '1 second')
        THEN 1 ELSE "RateLimitBucket"."count" + 1 END,
      "windowStart" = CASE
        WHEN "RateLimitBucket"."windowStart" < timezone('utc', now()) - (${windowSec}::float8 * interval '1 second')
        THEN timezone('utc', now()) ELSE "RateLimitBucket"."windowStart" END
    RETURNING "count"::int AS count`;
  const count = Number(rows[0]?.count ?? 0);
  if (count > limit) throw E.tooMany(message);
}
