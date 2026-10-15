import { describe, expect, it } from 'vitest';
import {
  daysUntil,
  formatDate,
  formatDateTime,
  parseIsoDate,
  parseIsoDateTime,
  parseUkDate,
  relativeDays,
  toDateInputValue,
  toDateTimeInputValue,
} from '@/lib/dates';

describe('parseUkDate', () => {
  it('parses the dd/mm/yyyy export format', () => {
    const date = parseUkDate('27/07/2018');
    expect(date?.toISOString()).toBe('2018-07-27T00:00:00.000Z');
  });

  it('does not read dd/mm as mm/dd', () => {
    // 03/09/2018 is 3 September, not 9 March.
    expect(parseUkDate('03/09/2018')?.getUTCMonth()).toBe(8);
  });

  it('accepts single-digit days and months', () => {
    expect(parseUkDate('3/9/2018')?.toISOString()).toBe('2018-09-03T00:00:00.000Z');
  });

  it('rejects impossible and non-date values', () => {
    expect(parseUkDate('31/02/2019')).toBeNull();
    expect(parseUkDate('PAID')).toBeNull();
    expect(parseUkDate('')).toBeNull();
    expect(parseUkDate('2018-07-27')).toBeNull();
  });
});

describe('parseIsoDate', () => {
  it('parses form input values at UTC midnight', () => {
    expect(parseIsoDate('2026-11-30')?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });
  it('rejects malformed input', () => {
    expect(parseIsoDate('30/11/2026')).toBeNull();
    expect(parseIsoDate('')).toBeNull();
  });
});

describe('formatting', () => {
  it('uses one consistent display format', () => {
    expect(formatDate(new Date(Date.UTC(2019, 1, 12)))).toBe('12 Feb 2019');
    expect(formatDate(null)).toBe('—');
    // Asserted exactly, in UTC: a loose match hid the time rendering in the
    // server's own timezone. Run under TZ=Pacific/Auckland to prove it.
    expect(formatDateTime(new Date(Date.UTC(2019, 1, 12, 14, 30)))).toBe('12 Feb 2019, 14:30');
  });

  it('round-trips through a date input', () => {
    const date = new Date(Date.UTC(2019, 1, 12));
    expect(toDateInputValue(date)).toBe('2019-02-12');
    expect(parseIsoDate(toDateInputValue(date))?.getTime()).toBe(date.getTime());
  });
});

describe('daysUntil / relativeDays', () => {
  const today = new Date(Date.UTC(2026, 9, 15));

  it('counts forwards and backwards', () => {
    expect(daysUntil(new Date(Date.UTC(2026, 9, 20)), today)).toBe(5);
    expect(daysUntil(new Date(Date.UTC(2026, 9, 10)), today)).toBe(-5);
    expect(daysUntil(today, today)).toBe(0);
    expect(daysUntil(null, today)).toBeNull();
  });

  it('describes overdue dates in plain words', () => {
    const yesterday = new Date(Date.now() - 86_400_000);
    expect(relativeDays(yesterday)).toBe('1 day overdue');
    expect(relativeDays(null)).toBe('—');
  });
});

describe('parseIsoDateTime', () => {
  it('reads a datetime-local value as UTC rather than server-local time', () => {
    expect(parseIsoDateTime('2026-02-12T14:30')?.toISOString()).toBe('2026-02-12T14:30:00.000Z');
    expect(parseIsoDateTime('2026-02-12T14:30:45')?.toISOString()).toBe('2026-02-12T14:30:45.000Z');
  });

  it('round-trips through the datetime input', () => {
    const date = new Date(Date.UTC(2026, 1, 12, 14, 30));
    expect(parseIsoDateTime(toDateTimeInputValue(date))?.getTime()).toBe(date.getTime());
  });

  it('rejects anything that is not that exact shape', () => {
    expect(parseIsoDateTime('2026-02-12')).toBeNull();
    expect(parseIsoDateTime('12/02/2026 14:30')).toBeNull();
    expect(parseIsoDateTime('')).toBeNull();
  });
});
