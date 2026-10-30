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
};

/** MailerSend caps a single send at fifty recipients. */
const MAX_RECIPIENTS = 50;

/**
 * The one way this app sends mail, through MailerSend.
 *
 * MailerLite, the marketing side, has no single-send endpoint: campaigns go to
 * lists, not to one address on demand. MailerSend is its transactional sibling
 * and shares the same account.
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
  const token = process.env.MAILERSEND_API_TOKEN?.trim();
  const to = message.to ?? process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM?.trim() || 'crm@residencyfirst.com';

  if (!token || !to) {
    return { sent: false, skipped: true, reason: 'MAILERSEND_API_TOKEN or ALERT_EMAIL_TO is not set.' };
  }

  const recipients = to
    .split(',')
    .map((address) => address.trim())
    .filter(Boolean)
    .slice(0, MAX_RECIPIENTS)
    .map((email) => ({ email }));

  if (recipients.length === 0) {
    return { sent: false, skipped: true, reason: 'No recipient address configured.' };
  }

  const response = await fetch('https://api.mailersend.com/v1/email', {
    method: 'POST',
    // Node has no default timeout: a hung provider would hold the request open.
    signal: AbortSignal.timeout(10_000),
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      'X-Requested-With': 'XMLHttpRequest',
    },
    body: JSON.stringify({
      from: { email: from, name: 'Residency First' },
      to: recipients,
      subject: message.subject,
      text: message.text,
      ...(message.html ? { html: message.html } : {}),
      ...(message.replyTo ? { reply_to: { email: message.replyTo } } : {}),
    }),
  });

  // MailerSend queues the message and answers 202 with an empty body.
  if (!response.ok) {
    const detail = await response.text().catch(() => '');
    return { sent: false, reason: `MailerSend returned ${response.status}${detail ? `: ${detail.slice(0, 200)}` : ''}.` };
  }
  return { sent: true };
}
