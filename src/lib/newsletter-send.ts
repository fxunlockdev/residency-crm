import 'server-only';
import { prisma } from './prisma';
import { mailFromHeader, resendKey } from './email';
import { renderNewsletterHtml, renderNewsletterText } from './newsletter-template';

/**
 * Sending one newsletter to the EB-5 updates list.
 *
 * Resend's batch endpoint takes a hundred separately addressed messages per
 * call, which is what this needs: every subscriber gets their own unsubscribe
 * link, and nobody can see who else is on the list. A single send with a
 * hundred addresses in `to` would leak the whole list to every recipient.
 *
 * The list itself stays here rather than being mirrored into the provider.
 * Two copies of a consent record is two answers to "did they unsubscribe",
 * and the wrong one eventually wins.
 */

const BATCH_ENDPOINT = 'https://api.resend.com/emails/batch';
const BATCH_SIZE = 100;
/** Resend allows two requests a second by default. */
const BATCH_PAUSE_MS = 600;
const TIMEOUT_MS = 20_000;

export type Recipient = { email: string; unsubscribeToken: string };
export type SendOutcome = { sent: number; failed: number; lastError?: string };

export function siteUrl(): string {
  return (process.env.PUBLIC_SITE_URL?.trim() || 'https://www.residencyfirst.com').replace(/\/+$/, '');
}

export function unsubscribeUrl(token: string): string {
  return `${siteUrl()}/unsubscribe?token=${encodeURIComponent(token)}`;
}

/**
 * Everyone who asked for email updates and has not opted out.
 *
 * WhatsApp-only subscribers have no email address and are excluded by the
 * null check, not by an assumption that every row has one.
 */
export async function newsletterRecipients(): Promise<Recipient[]> {
  const rows = await prisma.updateSubscription.findMany({
    where: { consentEmail: true, unsubscribedAt: null, email: { not: null } },
    select: { email: true, unsubscribeToken: true },
    orderBy: { createdAt: 'asc' },
  });

  return rows.flatMap((row) => (row.email ? [{ email: row.email, unsubscribeToken: row.unsubscribeToken }] : []));
}

export async function countNewsletterRecipients(): Promise<number> {
  return prisma.updateSubscription.count({
    where: { consentEmail: true, unsubscribedAt: null, email: { not: null } },
  });
}

type Letter = { subject: string; preheader: string | null; bodyMarkdown: string };

function messageFor(letter: Letter, recipient: Recipient) {
  const url = unsubscribeUrl(recipient.unsubscribeToken);
  const content = { ...letter, unsubscribeUrl: url };

  return {
    from: mailFromHeader(),
    to: [recipient.email],
    subject: letter.subject,
    html: renderNewsletterHtml(content),
    text: renderNewsletterText(content),
    headers: {
      // RFC 8058. Gmail and Outlook show their own unsubscribe button when
      // both of these are present, and penalise bulk senders without them.
      'List-Unsubscribe': `<${url}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  };
}

/**
 * Send to everyone, a hundred at a time.
 *
 * `onProgress` is called after each batch so the caller can record how far it
 * got. If the process dies mid-send, that record is the difference between
 * knowing who was mailed and sending the whole list twice.
 */
export async function sendNewsletter(
  letter: Letter,
  recipients: Recipient[],
  onProgress?: (outcome: SendOutcome) => Promise<void>,
  /** Makes a retried batch the same batch to Resend, rather than a second one. */
  idempotencyPrefix?: string,
): Promise<SendOutcome> {
  const key = resendKey();
  if (!key) return { sent: 0, failed: recipients.length, lastError: 'RESEND_API_KEY is not set.' };

  const outcome: SendOutcome = { sent: 0, failed: 0 };

  for (let start = 0; start < recipients.length; start += BATCH_SIZE) {
    const batch = recipients.slice(start, start + BATCH_SIZE);
    if (start > 0) await delay(BATCH_PAUSE_MS);

    const error = await postBatch(
      key,
      batch.map((recipient) => messageFor(letter, recipient)),
      idempotencyPrefix ? `${idempotencyPrefix}-${start / BATCH_SIZE}` : undefined,
    );
    if (error) {
      outcome.failed += batch.length;
      outcome.lastError = error;
    } else {
      outcome.sent += batch.length;
    }

    await onProgress?.({ ...outcome });
  }

  return outcome;
}

/** One address, for the test send. Shares the batch path so it proves it. */
export async function sendNewsletterTest(letter: Letter, address: string): Promise<SendOutcome> {
  return sendNewsletter(letter, [{ email: address, unsubscribeToken: 'preview-not-a-real-subscriber' }]);
}

async function postBatch(key: string, messages: unknown[], idempotencyKey?: string): Promise<string | null> {
  try {
    const response = await fetch(BATCH_ENDPOINT, {
      method: 'POST',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        // Resend honours this for 24 hours, so a batch replayed after a
        // crash is recognised rather than mailed again.
        ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
      },
      // The batch endpoint takes a bare array, not an object wrapping one.
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const detail = await response.text().catch(() => '');
      return `Resend returned ${response.status}${detail ? `: ${detail.slice(0, 300)}` : ''}.`;
    }
    return null;
  } catch (error) {
    return error instanceof Error ? error.message : 'Could not reach Resend.';
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
