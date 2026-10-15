/** Date helpers. Dates are stored as UTC midnight so a calendar day never shifts across timezones. */

/** Parse "dd/mm/yyyy" (the Zoho export format) into a UTC-midnight Date. */
export function parseUkDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const match = input.trim().match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  // Reject rollovers such as 31/02/2019.
  if (date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  return date;
}

/**
 * Parse an <input type="datetime-local"> value ("yyyy-mm-ddThh:mm") as UTC.
 * `new Date(value)` on a bare local datetime is interpreted in the *server's*
 * zone, so the same wall clock would store a different instant per deployment.
 */
export function parseIsoDateTime(input: string | null | undefined): Date | null {
  if (!input) return null;
  const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!match) return null;
  const date = new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:${match[6] ?? '00'}.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Parse an <input type="date"> value ("yyyy-mm-dd") into a UTC-midnight Date. */
export function parseIsoDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const match = input.trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(`${input.trim()}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Today at UTC midnight. */
export function todayUtc(): Date {
  const now = new Date();
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** "12 Feb 2019" — the single display format used across the app. */
export function formatDate(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** "12 Feb 2019, 14:30" for date-times such as meetings. */
export function formatDateTime(date: Date | null | undefined): string {
  if (!date) return '—';
  return new Intl.DateTimeFormat('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    // Without this the time renders in the server's zone while every stored
    // value and every form input is UTC.
    timeZone: 'UTC',
  }).format(date);
}

/** Value for an <input type="date">. */
export function toDateInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toISOString().slice(0, 10);
}

/** Value for an <input type="datetime-local">, rendered in UTC. */
export function toDateTimeInputValue(date: Date | null | undefined): string {
  if (!date) return '';
  return date.toISOString().slice(0, 16);
}

/** Whole days from today to `date`. Negative when overdue. */
export function daysUntil(date: Date | null | undefined, from: Date = todayUtc()): number | null {
  if (!date) return null;
  const target = Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate());
  return Math.round((target - from.getTime()) / 86_400_000);
}

/** "in 12 days" / "3 days overdue" / "today". */
export function relativeDays(date: Date | null | undefined): string {
  const days = daysUntil(date);
  if (days === null) return '—';
  if (days === 0) return 'today';
  if (days === 1) return 'tomorrow';
  if (days === -1) return '1 day overdue';
  if (days < 0) return `${Math.abs(days)} days overdue`;
  return `in ${days} days`;
}

/** Statutory EB-5 deadlines from the spec. */
export const FEE_INCREASE_DATE = new Date(Date.UTC(2026, 10, 30)); // 30 Nov 2026
export const INVESTMENT_INCREASE_DATE = new Date(Date.UTC(2027, 0, 1)); // 1 Jan 2027
