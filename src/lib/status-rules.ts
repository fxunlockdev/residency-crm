import type { ClientStatus, CommissionTrigger } from '@prisma/client';
import { STATUS_COMMISSION_TRIGGER, STATUS_DATE_FIELD, type StatusDateField } from './pipeline';

export type StatusDates = Partial<Record<StatusDateField, Date | null>>;

/**
 * Spec: "When status changes, auto-fill the matching date field if it is empty."
 * Returns only the fields that should actually change, so an existing date is never overwritten.
 */
export function backfillStatusDate(
  status: ClientStatus,
  current: StatusDates,
  today: Date,
): Partial<Record<StatusDateField, Date>> {
  const field = STATUS_DATE_FIELD[status];
  if (!field) return {};
  if (current[field]) return {};
  return { [field]: today } as Partial<Record<StatusDateField, Date>>;
}

/** The commission trigger a status unlocks, if any. */
export function commissionTriggerFor(status: ClientStatus): CommissionTrigger | null {
  return STATUS_COMMISSION_TRIGGER[status] ?? null;
}

/**
 * Google Ads offline conversions (spec): Engaged on reaching Engaged, Funded on reaching Funded.
 * Lead is recorded by the website intake endpoint instead.
 */
export function conversionTypeFor(status: ClientStatus): 'ENGAGED' | 'FUNDED' | null {
  if (status === 'ENGAGED') return 'ENGAGED';
  if (status === 'FUNDED') return 'FUNDED';
  return null;
}
