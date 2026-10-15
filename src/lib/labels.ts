import type {
  CommissionStatus,
  CommissionTrigger,
  DocumentKind,
  LeadSource,
  MeetingType,
  Role,
} from '@prisma/client';

export const SOURCE_LABEL: Record<LeadSource, string> = {
  GOOGLE_ADS: 'Google Ads',
  REFERRAL: 'Referral',
  WEBSITE: 'Website (organic)',
  EVENT: 'Event',
  PARTNER: 'Partner',
  LINKEDIN: 'LinkedIn',
  OTHER: 'Other',
};

export const MEETING_TYPE_LABEL: Record<MeetingType, string> = {
  CALL: 'Call',
  ZOOM: 'Zoom',
  IN_PERSON: 'In person',
  WHATSAPP: 'WhatsApp',
};

export const COMMISSION_TRIGGER_LABEL: Record<CommissionTrigger, string> = {
  ON_FUNDING: 'On funding',
  ON_I526E_FILING: 'On I-526E filing',
  ON_I526E_APPROVAL: 'On I-526E approval',
  OTHER: 'Other',
};

export const COMMISSION_STATUS_LABEL: Record<CommissionStatus, string> = {
  NOT_DUE: 'Not due',
  DUE: 'Due',
  INVOICED: 'Invoiced',
  PAID: 'Paid',
  DISPUTED: 'Disputed',
};

export const DOCUMENT_KIND_LABEL: Record<DocumentKind, string> = {
  I526E_RECEIPT: 'I-526E receipt',
  INVOICE: 'Invoice',
  OTHER: 'Other',
};

export const ROLE_LABEL: Record<Role, string> = {
  ADMIN: 'Admin',
  ADVISOR: 'Advisor',
  VIEWER: 'Read-only',
};

export const ROLE_DESCRIPTION: Record<Role, string> = {
  ADMIN: 'Full access, including users, imports and deletions.',
  ADVISOR: 'Create and edit clients, meetings and commissions.',
  VIEWER: 'Read-only access to every view.',
};

/** Countries whose nationals face longer Visa Bulletin waits (spec: chargeability). */
export const RETROGRESSION_COUNTRIES = new Set(['India', 'China']);

export function isRetrogressionCountry(country: string | null | undefined): boolean {
  return !!country && RETROGRESSION_COUNTRIES.has(country);
}

export function enumOptions<T extends string>(labels: Record<T, string>): Array<{ value: T; label: string }> {
  return (Object.keys(labels) as T[]).map((value) => ({ value, label: labels[value] }));
}
