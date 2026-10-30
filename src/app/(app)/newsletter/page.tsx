import type { Metadata } from 'next';
import Link from 'next/link';
import { requireRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { formatDateTime } from '@/lib/dates';
import { countNewsletterRecipients } from '@/lib/newsletter-send';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';

export const metadata: Metadata = { title: 'Newsletter' };

const STATUS_LABEL = { DRAFT: 'Draft', SENDING: 'Sending', SENT: 'Sent', FAILED: 'Failed' } as const;

export default async function NewsletterPage() {
  await requireRole('VIEWER');

  const [letters, recipients] = await Promise.all([
    prisma.newsletter.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        subject: true,
        status: true,
        sentAt: true,
        updatedAt: true,
        recipientCount: true,
        failureCount: true,
      },
    }),
    countNewsletterRecipients(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Website"
        title="Newsletter"
        description={
          <>
            Written here and sent to everyone on the{' '}
            <Link href="/subscribers?channel=email" className="link">
              EB-5 updates list
            </Link>{' '}
            who asked for email. {recipients} subscriber{recipients === 1 ? '' : 's'} would receive the next one.
          </>
        }
        actions={
          <Link href="/newsletter/new" className="btn-primary">
            Write a newsletter
          </Link>
        }
      />

      {letters.length === 0 ? (
        <EmptyState
          title="Nothing sent yet"
          description="Subscribers are collected by the signup on the website. Write one here when you have something worth their inbox."
        />
      ) : (
        <div className="surface divide-y divide-line">
          {letters.map((letter) => (
            <Link
              key={letter.id}
              href={`/newsletter/${letter.id}`}
              className="flex flex-col gap-2 px-5 py-4 transition-colors hover:bg-cream-warm sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0">
                <p className="truncate text-sm font-medium text-ink">{letter.subject}</p>
                <p className="mt-1 text-xs text-ink-mute">
                  {letter.status === 'SENT'
                    ? `Sent ${formatDateTime(letter.sentAt)} to ${letter.recipientCount} subscriber${
                        letter.recipientCount === 1 ? '' : 's'
                      }`
                    : `Edited ${formatDateTime(letter.updatedAt)}`}
                  {letter.failureCount > 0 ? ` · ${letter.failureCount} failed` : ''}
                </p>
              </div>
              <span
                className={
                  letter.status === 'SENT'
                    ? 'chip border-stage-emerald/30 bg-stage-emerald/8 text-stage-emerald'
                    : letter.status === 'FAILED'
                      ? 'chip border-stage-rose/30 bg-stage-rose/8 text-stage-rose'
                      : 'chip'
                }
              >
                {STATUS_LABEL[letter.status]}
              </span>
            </Link>
          ))}
        </div>
      )}
    </>
  );
}
