import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/dates';
import { countNewsletterRecipients } from '@/lib/newsletter-send';
import { renderBodyForEmail } from '@/lib/newsletter-template';
import { PageHeader } from '@/components/ui/page-header';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { NewsletterForm } from '@/components/newsletter/newsletter-form';
import { TestSend } from '@/components/newsletter/test-send';
import {
  deleteNewsletterAction,
  recoverStuckSendAction,
  retryNewsletterAction,
  sendNewsletterAction,
  updateNewsletterAction,
} from '@/server/newsletter-actions';

export const metadata: Metadata = { title: 'Newsletter' };

export default async function NewsletterDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireRole('ADVISOR');
  const { id } = await params;

  const [letter, recipients] = await Promise.all([
    prisma.newsletter.findUnique({ where: { id } }),
    countNewsletterRecipients(),
  ]);
  if (!letter) notFound();

  const draft = letter.status === 'DRAFT';

  return (
    <>
      <PageHeader
        eyebrow="Newsletter"
        title={draft ? 'Draft' : letter.status === 'SENT' ? 'Sent' : letter.status === 'SENDING' ? 'Sending' : 'Failed'}
        description={
          letter.status === 'SENT'
            ? `Sent ${formatDateTime(letter.sentAt)} to ${letter.recipientCount} subscriber${
                letter.recipientCount === 1 ? '' : 's'
              }.`
            : draft
              ? `Not sent. ${recipients} subscriber${recipients === 1 ? '' : 's'} would receive it.`
              : letter.status === 'SENDING'
                ? `Sending. ${letter.recipientCount} reached so far. If this has not moved for a while, the send has stopped and can be released.`
                : `This send did not finish. ${letter.recipientCount} subscriber${
                    letter.recipientCount === 1 ? '' : 's'
                  } were reached before it stopped.`
        }
        actions={
          user.role === 'ADMIN' && letter.status === 'SENDING' ? (
            <form action={recoverStuckSendAction}>
              <input type="hidden" name="newsletterId" value={letter.id} />
              <SubmitButton
                className="btn-quiet"
                confirm="Only do this if the send has clearly stopped. Some subscribers may already have received it."
              >
                Release a stopped send
              </SubmitButton>
            </form>
          ) : user.role === 'ADMIN' && letter.status === 'FAILED' ? (
            <form action={retryNewsletterAction}>
              <input type="hidden" name="newsletterId" value={letter.id} />
              <SubmitButton
                className="btn-quiet"
                confirm="Reopen this as a draft? Anyone already reached will receive it a second time when you send again."
              >
                Reopen as a draft
              </SubmitButton>
            </form>
          ) : user.role === 'ADMIN' && draft ? (
            <form action={sendNewsletterAction}>
              <input type="hidden" name="newsletterId" value={letter.id} />
              <SubmitButton
                className="btn-primary"
                pendingLabel="Sending…"
                confirm={`Send “${letter.subject}” to ${recipients} subscriber${
                  recipients === 1 ? '' : 's'
                }? This cannot be undone.`}
              >
                Send to {recipients} subscriber{recipients === 1 ? '' : 's'}
              </SubmitButton>
            </form>
          ) : null
        }
      />

      {letter.lastError ? (
        <div className="mb-6">
          <Alert tone="error" title="The last send reported a problem">
            {letter.lastError}
          </Alert>
        </div>
      ) : null}

      {draft ? (
        <>
          <NewsletterForm
            action={updateNewsletterAction}
            letter={letter}
            submitLabel="Save draft"
            cancelHref="/newsletter"
          />

          <section className="mt-10 border-t border-line pt-8">
            <h2 className="font-serif text-base font-medium text-ink">Before you send</h2>
            <p className="mt-1.5 text-sm text-ink-mute">
              Read it in a real inbox before anyone else does. Save first: the test sends the saved draft, not what is
              currently typed above.
            </p>
            <TestSend newsletterId={letter.id} address={user.email} />
          </section>

          {user.role === 'ADMIN' ? (
            <section className="mt-10 border-t border-line pt-8">
              <form action={deleteNewsletterAction}>
                <input type="hidden" name="newsletterId" value={letter.id} />
                <SubmitButton className="btn-quiet-danger" confirm="Delete this draft?">
                  Delete draft
                </SubmitButton>
              </form>
            </section>
          ) : null}
        </>
      ) : (
        <section className="surface px-6 py-6">
          <p className="eyebrow mb-2">Subject</p>
          <p className="font-serif text-lg text-ink">{letter.subject}</p>
          {/* Built by this app's own sanitising renderer, not by the author. */}
          <div
            className="article-preview mt-6 border-t border-line pt-6"
            dangerouslySetInnerHTML={{ __html: renderBodyForEmail(letter.bodyMarkdown) }}
          />
        </section>
      )}
    </>
  );
}
