import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { pruneRateLimits, rateLimit, rateLimitSafe } from '@/lib/rate-limit';

/**
 * Runs against the real database on purpose: the whole point of this limiter is
 * the atomic ON CONFLICT statement, which a mock would not exercise.
 */
const KEY = 'test:rate-limit';

beforeEach(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'test:' } } });
});

afterAll(async () => {
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'test:' } } });
  await prisma.$disconnect();
});

describe('rateLimit', () => {
  it('allows up to the limit and then blocks', async () => {
    for (let i = 1; i <= 3; i += 1) {
      const result = await rateLimit(KEY, 3, 60_000);
      expect(result.allowed).toBe(true);
      expect(result.count).toBe(i);
    }

    const blocked = await rateLimit(KEY, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('counts concurrent requests exactly once each', async () => {
    // The reason this lives in Postgres: ten simultaneous attempts must land on
    // ten distinct counts, not overwrite each other at the same value.
    const results = await Promise.all(Array.from({ length: 10 }, () => rateLimit(KEY, 100, 60_000)));
    const counts = results.map((r) => r.count).sort((a, b) => a - b);
    expect(counts).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
  });

  it('starts a fresh window once the old one expires', async () => {
    const first = await rateLimit(KEY, 1, 1);
    expect(first.allowed).toBe(true);

    await new Promise((resolve) => setTimeout(resolve, 20));

    const second = await rateLimit(KEY, 1, 60_000);
    expect(second.allowed).toBe(true);
    expect(second.count).toBe(1);
  });

  it('keeps separate keys independent', async () => {
    await rateLimit(`${KEY}:a`, 1, 60_000);
    expect((await rateLimit(`${KEY}:a`, 1, 60_000)).allowed).toBe(false);
    expect((await rateLimit(`${KEY}:b`, 1, 60_000)).allowed).toBe(true);
  });

  it('survives a redeploy, unlike a process-local counter', async () => {
    // Nothing in this test resets module state: the count is read back from the
    // database exactly as a second replica or a restarted process would see it.
    await rateLimit(KEY, 5, 60_000);
    await rateLimit(KEY, 5, 60_000);
    const row = await prisma.rateLimit.findUnique({ where: { key: KEY } });
    expect(row?.count).toBe(2);
  });
});

describe('pruneRateLimits', () => {
  it('removes expired windows and leaves live ones alone', async () => {
    await prisma.rateLimit.create({
      data: { key: 'test:expired', count: 9, resetAt: new Date(Date.now() - 60_000) },
    });
    await rateLimit('test:live', 5, 60_000);

    const removed = await pruneRateLimits();

    expect(removed).toBeGreaterThanOrEqual(1);
    expect(await prisma.rateLimit.findUnique({ where: { key: 'test:expired' } })).toBeNull();
    expect(await prisma.rateLimit.findUnique({ where: { key: 'test:live' } })).not.toBeNull();
  });
});

describe('rateLimitSafe', () => {
  it('lets the request through when the counter itself fails', async () => {
    // Rate limiting must never be the reason a sign-in or an enquiry fails, so
    // a database outage has to fall open rather than lock everyone out.
    const query = vi.spyOn(prisma, '$queryRaw').mockRejectedValueOnce(new Error('connection lost'));
    try {
      const result = await rateLimitSafe('test:unavailable', 1, 60_000);
      expect(result.allowed).toBe(true);
      expect(query).toHaveBeenCalledOnce();
    } finally {
      query.mockRestore();
    }
  });

  it('still enforces the limit when the counter is healthy', async () => {
    await rateLimitSafe('test:healthy', 1, 60_000);
    expect((await rateLimitSafe('test:healthy', 1, 60_000)).allowed).toBe(false);
  });
});
