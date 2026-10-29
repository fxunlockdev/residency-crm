import 'server-only';
import { sendEmail, type SendResult } from '@/lib/email';

export type LeadNotification = {
  fullName: string;
  email: string | null;
  phone: string | null;
  countryOfResidence: string | null;
  preferredContactMethod: string | null;
  readiness: string | null;
  enquiryIntent: string | null;
  source: string | null;
  landingPage: string | null;
  message: string | null;
  publicReference: string;
  clientId: string;
  /** True when this enquiry was merged into an existing client record. */
  repeat: boolean;
};

const READINESS_LABELS: Record<string, string> = {
  EXPLORING: 'Exploring options',
  WITHIN_SIX_MONTHS: 'Within six months',
  READY_NOW: 'Ready now',
};

const METHOD_LABELS: Record<string, string> = {
  EMAIL: 'Email',
  PHONE: 'Phone',
  WHATSAPP: 'WhatsApp',
};

/**
 * Where enquiry alerts land. Separate from ALERT_EMAIL_TO so the daily ops
 * digest and inbound enquiries can go to different inboxes, which is what the
 * handover asks for.
 */
function recipient(): string | undefined {
  return process.env.LEAD_NOTIFY_TO?.trim() || process.env.ALERT_EMAIL_TO?.trim() || undefined;
}

export function renderLeadNotification(lead: LeadNotification): string {
  const appUrl = process.env.APP_URL?.replace(/\/+$/, '') ?? '';
  const rows: Array<[string, string | null]> = [
    ['Name', lead.fullName],
    ['Email', lead.email],
    ['Phone', lead.phone],
    ['Country', lead.countryOfResidence],
    ['Prefers', lead.preferredContactMethod ? METHOD_LABELS[lead.preferredContactMethod] ?? lead.preferredContactMethod : null],
    ['Timeline', lead.readiness ? READINESS_LABELS[lead.readiness] ?? lead.readiness : null],
    ['Asked for', lead.enquiryIntent],
    ['Source', lead.source],
    ['Page', lead.landingPage],
    ['Reference', lead.publicReference],
  ];

  const lines: string[] = [
    lead.repeat
      ? 'A returning visitor sent another enquiry. It has been merged into their existing record.'
      : 'A new enquiry came in from the website.',
    '',
  ];

  const width = Math.max(...rows.map(([label]) => label.length));
  for (const [label, value] of rows) {
    if (value) lines.push(`${label.padEnd(width)}  ${value}`);
  }

  if (lead.message) {
    lines.push('', 'Their message:', '', lead.message);
  }

  if (appUrl) {
    lines.push('', `Open in the CRM: ${appUrl}/clients/${lead.clientId}`);
  }

  return lines.join('\n');
}

export async function sendLeadNotification(lead: LeadNotification): Promise<SendResult> {
  const prefix = lead.repeat ? 'Repeat enquiry' : 'New enquiry';
  const where = lead.enquiryIntent ? ` (${lead.enquiryIntent})` : '';
  return sendEmail({
    to: recipient(),
    // Replying goes straight back to the person who enquired.
    replyTo: lead.email ?? undefined,
    subject: `${prefix}: ${lead.fullName}${where}`,
    text: renderLeadNotification(lead),
  });
}

export type SubscriptionNotification = {
  name: string | null;
  email: string;
  consentEmail: boolean;
  consentWhatsapp: boolean;
  sourcePath: string | null;
};

export async function sendSubscriptionNotification(sub: SubscriptionNotification): Promise<SendResult> {
  const channels = [sub.consentEmail ? 'email' : null, sub.consentWhatsapp ? 'WhatsApp' : null]
    .filter(Boolean)
    .join(' and ');

  const lines = [
    'Someone joined the EB-5 deadline updates list.',
    '',
    `Name      ${sub.name ?? 'not given'}`,
    `Email     ${sub.email}`,
    `Channels  ${channels || 'none selected'}`,
    `Page      ${sub.sourcePath ?? 'not recorded'}`,
    '',
    'This is a news list signup, not a consultation enquiry.',
  ];

  return sendEmail({
    to: recipient(),
    subject: `EB-5 updates signup: ${sub.email}`,
    text: lines.join('\n'),
  });
}
