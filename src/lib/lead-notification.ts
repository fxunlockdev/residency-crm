import 'server-only';
import { sendEmail, type SendResult } from '@/lib/email';
import { renderEmailHtml, renderEmailText, type Email } from '@/lib/email-template';

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

const SOURCE_LABELS: Record<string, string> = {
  GOOGLE_ADS: 'Google Ads',
  REFERRAL: 'Referral',
  WEBSITE: 'Website',
  EVENT: 'Event',
  PARTNER: 'Partner',
  LINKEDIN: 'LinkedIn',
  OTHER: 'Other',
};

/**
 * The popups send a slug for what the reader clicked. Nobody reading an alert
 * at seven in the morning should have to decode `personalised-cost-breakdown`.
 */
function humanise(value: string): string {
  const words = value.replace(/[-_]+/g, ' ').trim();
  return words ? words.charAt(0).toUpperCase() + words.slice(1) : value;
}

/**
 * Where enquiry alerts land. Separate from ALERT_EMAIL_TO so the daily ops
 * digest and inbound enquiries can go to different inboxes, which is what the
 * handover asks for.
 */
function recipient(): string | undefined {
  return process.env.LEAD_NOTIFY_TO?.trim() || process.env.ALERT_EMAIL_TO?.trim() || undefined;
}

/** The content, independent of how it is rendered. */
export function leadEmail(lead: LeadNotification): Email {
  const appUrl = process.env.APP_URL?.replace(/\/+$/, '') ?? '';

  // Name is the heading; repeating it as a row is just noise.
  const rows = [
    { label: 'Email', value: lead.email },
    { label: 'Phone', value: lead.phone },
    { label: 'Country', value: lead.countryOfResidence },
    {
      label: 'Prefers',
      value: lead.preferredContactMethod
        ? (METHOD_LABELS[lead.preferredContactMethod] ?? lead.preferredContactMethod)
        : null,
    },
    { label: 'Timeline', value: lead.readiness ? (READINESS_LABELS[lead.readiness] ?? lead.readiness) : null },
    { label: 'Asked for', value: lead.enquiryIntent ? humanise(lead.enquiryIntent) : null },
    { label: 'Source', value: lead.source ? (SOURCE_LABELS[lead.source] ?? humanise(lead.source)) : null },
    { label: 'Page', value: lead.landingPage },
  ].filter((row): row is { label: string; value: string } => Boolean(row.value));

  return {
    eyebrow: lead.repeat ? 'Repeat enquiry' : 'New enquiry',
    heading: lead.fullName,
    intro: lead.repeat
      ? 'A returning visitor sent another enquiry. It has been merged into their existing record, and nothing already on file was overwritten.'
      : 'Someone asked for a consultation through the website.',
    rows,
    ...(lead.message ? { quote: { label: 'In their words', text: lead.message } } : {}),
    reference: lead.publicReference,
    ...(appUrl ? { cta: { label: 'Open in the CRM', href: `${appUrl}/clients/${lead.clientId}` } } : {}),
    footnote: 'Replying to this email replies to the enquirer.',
  };
}

export function renderLeadNotification(lead: LeadNotification): string {
  return renderEmailText(leadEmail(lead));
}

export async function sendLeadNotification(lead: LeadNotification): Promise<SendResult> {
  const prefix = lead.repeat ? 'Repeat enquiry' : 'New enquiry';
  const where = lead.enquiryIntent ? ` (${lead.enquiryIntent})` : '';
  const email = leadEmail(lead);

  return sendEmail({
    to: recipient(),
    // Replying goes straight back to the person who enquired.
    replyTo: lead.email ?? undefined,
    // A newline here would be a header-injection attempt, and intent is
    // visitor-supplied on the cost popups.
    subject: `${prefix}: ${lead.fullName}${where}`.replace(/[\r\n]+/g, ' ').slice(0, 200),
    text: renderEmailText(email),
    html: renderEmailHtml(email),
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
  const channels = [sub.consentEmail ? 'Email' : null, sub.consentWhatsapp ? 'WhatsApp' : null]
    .filter(Boolean)
    .join(' and ');

  const email: Email = {
    eyebrow: 'Updates list',
    heading: 'A new subscriber',
    intro: 'Someone joined the EB-5 deadline updates list. This is a news signup, not a consultation enquiry, and no client record was created.',
    rows: [
      { label: 'Name', value: sub.name ?? 'Not given' },
      { label: 'Contact', value: sub.email },
      { label: 'Channels', value: channels || 'None selected' },
      { label: 'Page', value: sub.sourcePath ?? 'Not recorded' },
    ],
    footnote: 'Sent by the Residency First EB-5 tracker.',
  };

  return sendEmail({
    to: recipient(),
    subject: `EB-5 updates signup: ${sub.email}`.replace(/[\r\n]+/g, ' ').slice(0, 200),
    text: renderEmailText(email),
    html: renderEmailHtml(email),
  });
}
