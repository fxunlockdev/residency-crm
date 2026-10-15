import 'server-only';
import { prisma } from './prisma';

/**
 * Rate limiting backed by Postgres.
 *
 * A process-local counter is multiplied by the replica count and reset by every
 * redeploy, which makes it useless as a bound on sign-in attempts or on writes
 * to the public lead endpoint. The counter therefore lives in a shared table.
 *
 * The increment is a single upsert-style statement so two concurrent requests
 * cannot both read the same count and write the same value back.
 */
export type RateLimitResult = { allowed: boolean; retryAfter: number; count: number };

export async function rateLimit(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowMs);

  // ON CONFLICT keeps this atomic: the window either survives (count + 1) or has
  // expired and is replaced, decided by the database rather than by the caller.
  const rows = await prisma.$queryRaw<Array<{ count: number; resetAt: Date }>>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt")
    VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" <= ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"
  `;

  const row = rows[0];
  if (!row) return { allowed: true, retryAfter: 0, count: 0 };

  const count = Number(row.count);
  if (count > limit) {
    const retryAfter = Math.max(1, Math.ceil((new Date(row.resetAt).getTime() - now.getTime()) / 1000));
    return { allowed: false, retryAfter, count };
  }
  return { allowed: true, retryAfter: 0, count };
}

/**
 * Clears expired rows. Called opportunistically rather than on a schedule; the
 * table is tiny and the index on resetAt makes this cheap.
 */
export async function pruneRateLimits(now: Date = new Date()): Promise<number> {
  const deleted = await prisma.rateLimit.deleteMany({ where: { resetAt: { lte: now } } });
  return deleted.count;
}

/**
 * Rate limiting must never be the reason a request fails. If the counter is
 * unavailable the request proceeds, and the failure is logged rather than
 * surfaced to the caller.
 */
export async function rateLimitSafe(key: string, limit: number, windowMs: number): Promise<RateLimitResult> {
  try {
    return await rateLimit(key, limit, windowMs);
  } catch (error) {
    console.error('Rate limit check failed; allowing the request.', error instanceof Error ? error.message : error);
    return { allowed: true, retryAfter: 0, count: 0 };
  }
}
