import { describe, expect, it } from 'vitest';
import { formatConversionTime, isWithinClickWindow, MAX_CLICK_AGE_DAYS } from '@/lib/google-ads';

describe('formatConversionTime', () => {
  it('uses the format the Google Ads API expects', () => {
    expect(formatConversionTime(new Date(Date.UTC(2026, 9, 15, 9, 30, 0)))).toBe('2026-10-15 09:30:00+00:00');
  });
});

describe('isWithinClickWindow', () => {
  const now = new Date(Date.UTC(2026, 9, 15));

  it('accepts recent clicks', () => {
    expect(isWithinClickWindow(new Date(Date.UTC(2026, 9, 1)), now)).toBe(true);
    expect(isWithinClickWindow(now, now)).toBe(true);
  });

  it('rejects clicks beyond the 90-day import window', () => {
    const tooOld = new Date(now.getTime() - (MAX_CLICK_AGE_DAYS + 1) * 86_400_000);
    expect(isWithinClickWindow(tooOld, now)).toBe(false);
  });

  it('accepts a click exactly at the boundary', () => {
    const boundary = new Date(now.getTime() - MAX_CLICK_AGE_DAYS * 86_400_000);
    expect(isWithinClickWindow(boundary, now)).toBe(true);
  });
});
