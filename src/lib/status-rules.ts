import type { ClientStatus, CommissionTrigger } from '@prisma/client';
import { STATUS_COMMISSION_TRIGGER, STATUS_DATE_FIELD, STATUS_ORDER, statusIndex, type StatusDateField } from './pipeline';

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

/**
 * Every stage from just after `from` up to and including `to`, in pipeline order.
 *
 * Stages can be skipped — the board lets a card be dragged anywhere — so the
 * side effects of each stage crossed must be applied, not only the
 * destination's. Otherwise Prospect straight to "I-526E filed" would leave the
 * on-funding commission at Not due and never record the Funded conversion.
 */
export function stagesCrossed(from: ClientStatus | undefined, to: ClientStatus): ClientStatus[] {
  if (to === 'LOST') return [];
  const target = statusIndex(to);
  const start = from === undefined || from === 'LOST' ? target : statusIndex(from) + 1;
  if (start > target) return [to];
  return STATUS_ORDER.slice(start, target + 1).filter((stage) => stage !== 'LOST');
}
