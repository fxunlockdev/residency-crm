import { describe, expect, it } from 'vitest';
import { formatCents, formatCentsCompact, parseMoneyToCents, sumCents } from '@/lib/money';

describe('parseMoneyToCents', () => {
  it('parses the legacy currency format', () => {
    expect(parseMoneyToCents('$39,950')).toBe(3_995_000);
    expect(parseMoneyToCents('$40,000')).toBe(4_000_000);
    expect(parseMoneyToCents('$8,800')).toBe(880_000);
  });

  it('treats blanks and NONE as absent', () => {
    expect(parseMoneyToCents('')).toBeNull();
    expect(parseMoneyToCents('   ')).toBeNull();
    expect(parseMoneyToCents('NONE')).toBeNull();
    expect(parseMoneyToCents(null)).toBeNull();
    expect(parseMoneyToCents(undefined)).toBeNull();
  });

  it('keeps sub-dollar precision without float drift', () => {
    expect(parseMoneyToCents('0.1')).toBe(10);
    expect(parseMoneyToCents('1234.56')).toBe(123_456);
    expect(parseMoneyToCents(937_500)).toBe(93_750_000);
  });

  it('rejects junk', () => {
    expect(parseMoneyToCents('n/a')).toBeNull();
    expect(parseMoneyToCents('PAID')).toBeNull();
  });
});

describe('formatCents', () => {
  it('omits decimals for whole dollars', () => {
    expect(formatCents(3_995_000)).toBe('$39,950');
    expect(formatCents(0)).toBe('$0');
  });

  it('shows decimals only when present', () => {
    expect(formatCents(123_456)).toBe('$1,234.56');
  });

  it('renders an em dash for missing values', () => {
    expect(formatCents(null)).toBe('—');
    expect(formatCents(undefined)).toBe('—');
  });
});

describe('formatCentsCompact', () => {
  it('abbreviates thousands and millions', () => {
    expect(formatCentsCompact(3_995_000)).toBe('$40k');
    expect(formatCentsCompact(92_500_000)).toBe('$925k');
    expect(formatCentsCompact(120_000_000)).toBe('$1.2m');
    expect(formatCentsCompact(50_000)).toBe('$500');
  });
});

describe('sumCents', () => {
  it('ignores nulls', () => {
    expect(sumCents([100, null, 200, undefined])).toBe(300);
    expect(sumCents([])).toBe(0);
  });
});
