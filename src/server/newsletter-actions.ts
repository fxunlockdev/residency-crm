'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { AuthError, requireRoleOrThrow, requireRoleOrRedirect } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { fieldErrors, newsletterSchema } from '@/lib/validation';
import { renderNewsletterHtml } from '@/lib/newsletter-template';
import {
  newsletterRecipients,
  sendNewsletter,
  sendNewsletterTest,
  unsubscribeUrl,
  type SendOutcome,
} from '@/lib/newsletter-send';
import type { FormState } from './client-actions';

export async function createNewsletterAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = newsletterSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const letter = await prisma.newsletter.create({
    data: { ...parsed.data, bodyHtml: '', createdById: user.id },
    select: { id: true },
  });

  await recordAudit({
    entity: 'Newsletter',
    entityId: letter.id,
    action: 'created',
    actor: user,
    summary: `${user.name} drafted the newsletter “${parsed.data.subject}”`,
  });

  revalidatePath('/newsletter');
  redirect(`/newsletter/${letter.id}`);
}

export async function updateNewsletterAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const id = String(formData.get('newsletterId') ?? '');
  const existing = await prisma.newsletter.findUnique({ where: { id }, select: { status: true } });
  if (!existing) return { message: 'That newsletter no longer exists.' };
  if (existing.status !== 'DRAFT') {
    return { message: 'This newsletter has already been sent. Copy it to a new draft to reuse the text.' };
  }

  const parsed = newsletterSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  // Guarded on status, not just the id: a save that lands between the send
  // claiming the draft and reading it would change the text after it was
  // read, leaving the record describing something nobody was sent.
  const saved = await prisma.newsletter.updateMany({ where: { id, status: 'DRAFT' }, data: parsed.data });
  if (saved.count === 0) return { message: 'This newsletter started sending while you were editing. Nothing was saved.' };

  await recordAudit({
    entity: 'Newsletter',
    entityId: id,
    action: 'updated',
    actor: user,
    summary: `${user.name} edited the newsletter “${parsed.data.subject}”`,
  });

  revalidatePath(`/newsletter/${id}`);
  return { ok: true, message: 'Draft saved.' };
}

/**
 * A copy to yourself before sending to everyone.
 *
 * Only to the signed-in user's own address. The body is whatever the author
 * typed and it goes out from the firm's verified sending domain, so an open
 * recipient field would be a way to send convincing mail from
 * `crm@residencyfirst.com` to anyone at all.
 */
export async function sendTestAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const id = String(formData.get('newsletterId') ?? '');
  const address = user.email;

  const letter = await prisma.newsletter.findUnique({
    where: { id },
    select: { subject: true, preheader: true, bodyMarkdown: true },
  });
  if (!letter) return { message: 'That newsletter no longer exists.' };

  const outcome = await sendNewsletterTest({ ...letter, subject: `[Test] ${letter.subject}` }, address);
  if (outcome.sent === 0) return { message: outcome.lastError ?? 'The test could not be sent.' };
  return { ok: true, message: `Test sent to ${address}.` };
}

/**
 * Send to the whole list.
 *
 * The draft is claimed with a conditional update before anything is sent, so
 * two clicks, or two people, cannot send the same newsletter twice. Progress
 * is written after each batch: if this is interrupted, the record says how
 * far it got rather than leaving it ambiguous.
 */
export async function sendNewsletterAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADMIN');
  const id = String(formData.get('newsletterId') ?? '');

  const claimed = await prisma.newsletter.updateMany({
    where: { id, status: 'DRAFT' },
    data: { status: 'SENDING', sendStartedAt: new Date(), lastError: null },
  });
  if (claimed.count === 0) {
    revalidatePath(`/newsletter/${id}`);
    return;
  }

  // Everything after the claim runs inside try/finally. Without it, a throw
  // anywhere here leaves the newsletter in SENDING with no way back: it can
  // no longer be edited, sent or deleted, and nothing resets it.
  let letterSubject = '';
  let outcome: SendOutcome = { sent: 0, failed: 0 };

  try {
    const letter = await prisma.newsletter.findUniqueOrThrow({
      where: { id },
      select: { subject: true, preheader: true, bodyMarkdown: true },
    });
    letterSubject = letter.subject;

    const recipients = await newsletterRecipients();
    // Stored so the sent newsletter can be read back exactly as it went out,
    // with a representative unsubscribe link rather than any one person's.
    const bodyHtml = renderNewsletterHtml({ ...letter, unsubscribeUrl: unsubscribeUrl('example-token') });

    outcome = await sendNewsletter(
      letter,
      recipients,
      async (progress) => {
        await prisma.newsletter.update({
          where: { id },
          data: { recipientCount: progress.sent, failureCount: progress.failed },
        });
      },
      // Tied to this newsletter, so a replayed batch is recognised by Resend
      // rather than delivered twice.
      `rf-newsletter-${id}`,
    );

    await prisma.newsletter.update({
      where: { id },
      data: {
        status: outcome.sent > 0 ? 'SENT' : 'FAILED',
        sentAt: outcome.sent > 0 ? new Date() : null,
        recipientCount: outcome.sent,
        failureCount: outcome.failed,
        bodyHtml,
        lastError: outcome.lastError ?? null,
      },
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : 'Unknown error sending the newsletter.';
    await prisma.newsletter
      .update({ where: { id }, data: { status: 'FAILED', lastError: reason } })
      .catch(() => undefined);
    throw error;
  }

  await recordAudit({
    entity: 'Newsletter',
    entityId: id,
    action: 'sent',
    actor: user,
    summary: `${user.name} sent “${letterSubject}” to ${outcome.sent} subscriber${outcome.sent === 1 ? '' : 's'}${
      outcome.failed > 0 ? `, ${outcome.failed} failed` : ''
    }`,
  });

  revalidatePath('/newsletter');
  revalidatePath(`/newsletter/${id}`);
}

/**
 * How long a send may sit claimed before it is treated as dead.
 *
 * A process killed mid-send, by a deploy or a platform timeout, leaves the
 * newsletter in SENDING with no code left running to finish it. Past this, an
 * administrator can take it back. Resend's idempotency keys last 24 hours, so
 * a resend inside that window will not re-deliver the batches that got out.
 */
const STALE_SEND_MS = 15 * 60 * 1000;

export async function recoverStuckSendAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADMIN');
  const id = String(formData.get('newsletterId') ?? '');

  const released = await prisma.newsletter.updateMany({
    where: { id, status: 'SENDING', sendStartedAt: { lt: new Date(Date.now() - STALE_SEND_MS) } },
    data: {
      status: 'FAILED',
      lastError: 'The send stopped before it finished. Check how many were reached before sending again.',
    },
  });

  if (released.count > 0) {
    await recordAudit({
      entity: 'Newsletter',
      entityId: id,
      action: 'updated',
      actor: user,
      summary: `${user.name} released a send that had stopped part-way`,
    });
  }

  revalidatePath(`/newsletter/${id}`);
}

/**
 * A failed or interrupted send becomes a fresh draft to re-send.
 *
 * Deliberately a separate action with its own confirmation: the only safe
 * assumption is that some subscribers were already reached.
 */
export async function retryNewsletterAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADMIN');
  const id = String(formData.get('newsletterId') ?? '');

  const reopened = await prisma.newsletter.updateMany({
    where: { id, status: 'FAILED' },
    data: { status: 'DRAFT', sendStartedAt: null },
  });
  if (reopened.count === 0) return;

  await recordAudit({
    entity: 'Newsletter',
    entityId: id,
    action: 'updated',
    actor: user,
    summary: `${user.name} reopened a failed newsletter as a draft`,
  });

  revalidatePath('/newsletter');
  revalidatePath(`/newsletter/${id}`);
}

export async function deleteNewsletterAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADMIN');
  const id = String(formData.get('newsletterId') ?? '');
  const letter = await prisma.newsletter.findUnique({ where: { id }, select: { subject: true, status: true } });
  if (!letter) redirect('/newsletter');
  // A sent newsletter is a record of what subscribers were told. Keep it.
  if (letter.status !== 'DRAFT') redirect(`/newsletter/${id}`);

  await prisma.newsletter.delete({ where: { id } });
  await recordAudit({
    entity: 'Newsletter',
    entityId: id,
    action: 'deleted',
    actor: user,
    summary: `${user.name} deleted the draft newsletter “${letter.subject}”`,
  });

  revalidatePath('/newsletter');
  redirect('/newsletter');
}
