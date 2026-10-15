import { describe, expect, it } from 'vitest';
import { pruneRateLimits, rateLimit } from '@/lib/rate-limit';

describe('rateLimit', () => {
  it('allows up to the limit then blocks', () => {
    const key = `test-${Math.random()}`;
    for (let i = 0; i < 3; i += 1) {
      expect(rateLimit(key, 3, 60_000).allowed).toBe(true);
    }
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfter).toBeGreaterThan(0);
  });

  it('keeps separate buckets per key', () => {
    const a = `a-${Math.random()}`;
    const b = `b-${Math.random()}`;
    rateLimit(a, 1, 60_000);
    expect(rateLimit(a, 1, 60_000).allowed).toBe(false);
    expect(rateLimit(b, 1, 60_000).allowed).toBe(true);
  });

  it('resets once the window has passed', () => {
    const key = `window-${Math.random()}`;
    expect(rateLimit(key, 1, 1).allowed).toBe(true);
    // The window is 1ms, so the next call falls into a fresh bucket.
    const later = Date.now() + 10;
    while (Date.now() < later) { /* spin briefly */ }
    expect(rateLimit(key, 1, 1).allowed).toBe(true);
  });

  it('prunes expired buckets', () => {
    expect(() => pruneRateLimits(Date.now() + 1_000_000)).not.toThrow();
  });
});
