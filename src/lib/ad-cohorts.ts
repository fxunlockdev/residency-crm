import type { ClientStatus } from '@prisma/client';
import { WON_STATUSES } from './pipeline';

/**
 * Cohorting rules for ad performance.
 *
 * An EB-5 deal takes months to close, so comparing this month's spend against
 * this month's funded investors divides one month's cost by another month's
 * outcome. Every figure here is grouped by the month the lead *arrived*, and
 * recent months are marked as still maturing so a young cohort is not read as
 * a failed one.
 */

/** Typical months from first click to funded. Months younger than this are incomplete. */
export const MATURATION_MONTHS = 9;

/** "2026-03" — a sortable, timezone-stable month key. */
export function monthKey(date: Date): string {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, '0')}`;
}

export function monthLabel(key: string): string {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return key;
  return new Intl.DateTimeFormat('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, 1)),
  );
}

/** Whole months between a cohort month and now. */
export function monthsElapsed(key: string, now: Date = new Date()): number {
  const [year, month] = key.split('-').map(Number);
  if (!year || !month) return 0;
  return (now.getUTCFullYear() - year) * 12 + (now.getUTCMonth() + 1 - month);
}

/**
 * A cohort younger than the typical sales cycle has not had time to produce
 * funded investors, so its cost-per-investor is not yet a real number.
 */
export function isMaturing(key: string, now: Date = new Date()): boolean {
  return monthsElapsed(key, now) < MATURATION_MONTHS;
}

export function isWon(status: ClientStatus): boolean {
  return WON_STATUSES.includes(status);
}

export function isEngagedOrBeyond(status: ClientStatus): boolean {
  return status !== 'PROSPECT' && status !== 'LOST';
}

/** Cost per outcome, or null when there were none — never a division by zero. */
export function costPer(costCents: number, count: number): number | null {
  if (count <= 0) return null;
  return Math.round(costCents / count);
}

/** Commission earned for every unit spent. Null when nothing was spent. */
export function returnOnSpend(commissionCents: number, costCents: number): number | null {
  if (costCents <= 0) return null;
  return Math.round((commissionCents / costCents) * 100) / 100;
}
