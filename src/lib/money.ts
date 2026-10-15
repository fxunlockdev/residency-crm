/**
 * All monetary values are stored as integer US cents.
 * These helpers are the only sanctioned way to cross the cents <-> display boundary.
 */

/** Parse "$39,950", "39950", "39,950.50" or "" into integer cents. Returns null when empty/unparseable. */
export function parseMoneyToCents(input: string | number | null | undefined): number | null {
  if (input === null || input === undefined) return null;
  if (typeof input === 'number') {
    if (!Number.isFinite(input)) return null;
    return Math.round(input * 100);
  }
  const cleaned = input.replace(/[$,\s]/g, '').trim();
  if (cleaned === '' || cleaned.toUpperCase() === 'NONE' || cleaned === '-') return null;
  const value = Number(cleaned);
  if (!Number.isFinite(value)) return null;
  return Math.round(value * 100);
}

/** 3995000 -> "$39,950" (or "$39,950.50" when there are cents). */
export function formatCents(cents: number | null | undefined, options?: { dash?: boolean }): string {
  if (cents === null || cents === undefined) return options?.dash === false ? '' : '—';
  const hasFraction = cents % 100 !== 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: hasFraction ? 2 : 0,
    maximumFractionDigits: hasFraction ? 2 : 0,
  }).format(cents / 100);
}

/** Compact form for dashboard tiles: 3995000 -> "$39.9k", 92500000 -> "$925k", 120000000 -> "$1.2m". */
export function formatCentsCompact(cents: number | null | undefined): string {
  if (cents === null || cents === undefined) return '—';
  const dollars = cents / 100;
  const abs = Math.abs(dollars);
  if (abs >= 1_000_000) return `$${trimZero(dollars / 1_000_000)}m`;
  if (abs >= 1_000) return `$${trimZero(dollars / 1_000)}k`;
  return `$${Math.round(dollars)}`;
}

function trimZero(n: number): string {
  const rounded = Math.round(n * 10) / 10;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
}

export function sumCents(values: Array<number | null | undefined>): number {
  return values.reduce<number>((total, v) => total + (v ?? 0), 0);
}
