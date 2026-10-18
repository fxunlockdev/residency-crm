import { describe, expect, it } from 'vitest';
import {
  MATURATION_MONTHS,
  costPer,
  isMaturing,
  monthKey,
  monthLabel,
  monthsElapsed,
  returnOnSpend,
} from '@/lib/ad-cohorts';

describe('monthKey', () => {
  it('keys by UTC month, so a late-night lead does not land in the wrong one', () => {
    expect(monthKey(new Date('2026-03-01T00:00:00.000Z'))).toBe('2026-03');
    expect(monthKey(new Date('2026-03-31T23:59:59.000Z'))).toBe('2026-03');
    expect(monthKey(new Date('2026-12-31T23:30:00.000Z'))).toBe('2026-12');
  });

  it('sorts lexicographically in date order', () => {
    const keys = ['2026-09', '2025-12', '2026-10', '2026-01'];
    expect([...keys].sort()).toEqual(['2025-12', '2026-01', '2026-09', '2026-10']);
  });
});

describe('monthLabel', () => {
  it('reads as a month', () => {
    expect(monthLabel('2026-03')).toBe('Mar 2026');
  });
  it('does not blow up on nonsense', () => {
    expect(monthLabel('rubbish')).toBe('rubbish');
  });
});

describe('monthsElapsed', () => {
  const now = new Date('2026-10-18T00:00:00.000Z');

  it('counts whole months, including across a year boundary', () => {
    expect(monthsElapsed('2026-10', now)).toBe(0);
    expect(monthsElapsed('2026-09', now)).toBe(1);
    expect(monthsElapsed('2025-10', now)).toBe(12);
    expect(monthsElapsed('2024-04', now)).toBe(30);
  });
});

describe('isMaturing', () => {
  const now = new Date('2026-10-18T00:00:00.000Z');

  it('marks a cohort too young to have produced investors', () => {
    // The whole point: a month-old cohort with no funded investors is not a
    // failed campaign, it is an unfinished one.
    expect(isMaturing('2026-10', now)).toBe(true);
    expect(isMaturing('2026-08', now)).toBe(true);
  });

  it('treats a cohort past the sales cycle as complete', () => {
    expect(isMaturing('2025-06', now)).toBe(false);
  });

  it('flips exactly at the maturation boundary', () => {
    const boundary = new Date(Date.UTC(2026, 9 - MATURATION_MONTHS, 18));
    expect(isMaturing(monthKey(boundary), now)).toBe(false);
  });
});

describe('costPer', () => {
  it('divides spend across outcomes', () => {
    expect(costPer(100_000, 4)).toBe(25_000);
  });

  it('returns null rather than dividing by zero', () => {
    // A campaign with no funded investors has no cost per investor — showing
    // Infinity or 0 would both be lies.
    expect(costPer(100_000, 0)).toBeNull();
    expect(costPer(100_000, -1)).toBeNull();
  });

  it('rounds to whole cents', () => {
    expect(costPer(100, 3)).toBe(33);
  });
});

describe('returnOnSpend', () => {
  it('reports commission per unit spent', () => {
    expect(returnOnSpend(400_000, 100_000)).toBe(4);
    expect(returnOnSpend(50_000, 100_000)).toBe(0.5);
  });

  it('returns null when nothing was spent', () => {
    expect(returnOnSpend(400_000, 0)).toBeNull();
  });

  it('keeps two decimals', () => {
    expect(returnOnSpend(333_333, 100_000)).toBe(3.33);
  });
});
