import 'server-only';

/** `skipped` means mail is not configured at all, which is not a failure. */
export type SendResult = { sent: boolean; skipped?: boolean; reason?: string };

export type Message = {
  subject: string;
  /** Always sent. Some clients will not render HTML, and some people prefer not to. */
  text: string;
  html?: string;
  /** Comma-separated. Defaults to ALERT_EMAIL_TO. */
  to?: string;
  replyTo?: string;
  /** Extra MIME headers. The newsletter uses this for List-Unsubscribe. */
  headers?: Record<string, string>;
};

/** Resend caps a single send at fifty recipients. */
export const MAX_RECIPIENTS = 50;

const ENDPOINT = 'https://api.resend.com/emails';
const TIMEOUT_MS = 10_000;

export function mailFrom(): string {
  return process.env.ALERT_EMAIL_FROM?.trim() || 'crm@residencyfirst.com';
}

/** `Residency First <crm@residencyfirst.com>`, which is what Resend wants. */
export function mailFromHeader(): string {
  return `Residency First <${mailFrom()}>`;
}

export function resendKey(): string {
  return process.env.RESEND_API_KEY?.trim() ?? '';
}

export function splitRecipients(list: string): string[] {
  return [...new Set(list.split(',').map((address) => address.trim()).filter(Boolean))];
}

/**
 * The one way this app sends mail, through Resend.
 *
 * Never throws. A notification failing must not turn a durable write into an
 * error for the visitor, so the caller gets a reason back and decides what to
 * log.
 */
export async function sendEmail(message: Message): Promise<SendResult> {
  try {
    return await deliver(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error sending mail.';
    return { sent: false, reason };
  }
}

async function deliver(message: Message): Promise<SendResult> {
  const key = resendKey();
  const to = message.to ?? process.env.ALERT_EMAIL_TO;

  if (!key || !to) {
    return { sent: false, skipped: true, reason: 'RESEND_API_KEY or ALERT_EMAIL_TO is not set.' };
  }

  const recipients = splitRecipients(to).slice(0, MAX_RECIPIENTS);
  if (recipients.length === 0) {
    return { sent: false, skipped: true, reason: 'No recipient address configured.' };
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    // Node has no default timeout: a hung provider would hold the request open.
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from: mailFromHeader(),
      to: recipients,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { reply_to: message.replyTo } : {}),
      ...(message.headers ? { headers: message.headers } : {}),
    }),
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { sent: false, reason: `Resend returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}.` };
  }
  return { sent: true };
}
