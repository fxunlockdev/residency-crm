import type { ClientStatus, CommissionTrigger } from '@prisma/client';

export const STATUS_ORDER: ClientStatus[] = [
  'PROSPECT',
  'ENGAGED',
  'FUNDED',
  'I526E_FILED',
  'I526E_APPROVED',
  'GREEN_CARD_CONDITIONAL',
  'I829_FILED',
  'I829_APPROVED',
  'LOST',
];

export const STATUS_LABEL: Record<ClientStatus, string> = {
  PROSPECT: 'Prospect',
  ENGAGED: 'Engaged',
  FUNDED: 'Funded',
  I526E_FILED: 'I-526E filed',
  I526E_APPROVED: 'I-526E approved',
  GREEN_CARD_CONDITIONAL: 'Green card issued (conditional)',
  I829_FILED: 'I-829 filed',
  I829_APPROVED: 'I-829 approved (permanent)',
  LOST: 'Lost / Not proceeding',
};

/** Short label for dense surfaces such as the kanban board and table chips. */
export const STATUS_SHORT_LABEL: Record<ClientStatus, string> = {
  PROSPECT: 'Prospect',
  ENGAGED: 'Engaged',
  FUNDED: 'Funded',
  I526E_FILED: 'I-526E filed',
  I526E_APPROVED: 'I-526E approved',
  GREEN_CARD_CONDITIONAL: 'Green card',
  I829_FILED: 'I-829 filed',
  I829_APPROVED: 'Permanent',
  LOST: 'Lost',
};

/** The date field a status change back-fills when it is still empty. */
export const STATUS_DATE_FIELD: Partial<Record<ClientStatus, StatusDateField>> = {
  FUNDED: 'dateFunded',
  I526E_FILED: 'i526eFiledDate',
  I526E_APPROVED: 'i526eApprovedDate',
  GREEN_CARD_CONDITIONAL: 'greenCardIssuedDate',
  I829_FILED: 'i829FiledDate',
  I829_APPROVED: 'i829ApprovedDate',
};

export type StatusDateField =
  | 'dateFunded'
  | 'i526eFiledDate'
  | 'i526eApprovedDate'
  | 'greenCardIssuedDate'
  | 'i829FiledDate'
  | 'i829ApprovedDate';

/** The commission trigger a status unlocks, moving matching rows from Not due to Due. */
export const STATUS_COMMISSION_TRIGGER: Partial<Record<ClientStatus, CommissionTrigger>> = {
  FUNDED: 'ON_FUNDING',
  I526E_FILED: 'ON_I526E_FILING',
  I526E_APPROVED: 'ON_I526E_APPROVAL',
};

/** Lost records stay in the database but drop out of the active views. */
export const ACTIVE_STATUSES: ClientStatus[] = STATUS_ORDER.filter((s) => s !== 'LOST');

/** Statuses that have not yet filed an I-526E — the deadline watchlist. */
export const PRE_FILING_STATUSES: ClientStatus[] = ['PROSPECT', 'ENGAGED', 'FUNDED'];

export const WON_STATUSES: ClientStatus[] = [
  'FUNDED',
  'I526E_FILED',
  'I526E_APPROVED',
  'GREEN_CARD_CONDITIONAL',
  'I829_FILED',
  'I829_APPROVED',
];

export function statusIndex(status: ClientStatus): number {
  return STATUS_ORDER.indexOf(status);
}

export function isForwardMove(from: ClientStatus, to: ClientStatus): boolean {
  if (to === 'LOST') return false;
  return statusIndex(to) > statusIndex(from);
}

/** Tailwind token set per status, so every surface colours a stage identically. */
export const STATUS_TONE: Record<ClientStatus, 'slate' | 'sky' | 'amber' | 'violet' | 'emerald' | 'rose'> = {
  PROSPECT: 'slate',
  ENGAGED: 'sky',
  FUNDED: 'amber',
  I526E_FILED: 'violet',
  I526E_APPROVED: 'violet',
  GREEN_CARD_CONDITIONAL: 'emerald',
  I829_FILED: 'emerald',
  I829_APPROVED: 'emerald',
  LOST: 'rose',
};

/**
 * The sales board is a different lens on the same pipeline: it covers only the
 * stages where revenue is still being won, and a case drops off it once the
 * commission has actually been paid. The full nine-stage case lifecycle stays
 * on the client record and the clients table.
 */
export const SALES_STAGES: ClientStatus[] = ['PROSPECT', 'ENGAGED', 'FUNDED', 'I526E_FILED'];

/** Column headings on the sales board. These name a column, not a new status. */
export const SALES_STAGE_HEADING: Record<string, string> = {
  PROSPECT: 'Hot prospects',
  ENGAGED: 'Engaged',
  FUNDED: 'Funded',
  I526E_FILED: 'I-526E filed',
};

/** Attorney becomes a working field from Engaged onwards. */
export function stageNeedsAttorney(status: ClientStatus): boolean {
  return statusIndex(status) >= statusIndex('ENGAGED') && status !== 'LOST';
}
