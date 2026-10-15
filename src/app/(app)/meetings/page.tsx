import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { StatusChip } from '@/components/ui/chips';
import { formatDateTime } from '@/lib/dates';
import { MEETING_TYPE_LABEL } from '@/lib/labels';

export const metadata: Metadata = { title: 'Meetings' };
export const dynamic = 'force-dynamic';

export default async function MeetingsPage() {
  const meetings = await prisma.meeting.findMany({
    orderBy: { occurredAt: 'desc' },
    take: 100,
    include: {
      client: { select: { id: true, fullName: true, reference: true, status: true } },
      createdBy: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Meetings"
        description="The hundred most recent meetings across every client, newest first."
      />

      {meetings.length === 0 ? (
        <EmptyState
          title="No meetings logged yet"
          description="Log meetings from a client record and they will collect here."
          action={
            <Link href="/clients" className="btn-ghost">
              Browse clients
            </Link>
          }
        />
      ) : (
        <div className="surface overflow-hidden">
          <ul className="divide-y divide-line">
            {meetings.map((meeting) => (
              <li key={meeting.id} className="px-5 py-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2">
                      <Link href={`/clients/${meeting.client.id}`} className="font-medium text-ink hover:text-pink-deep">
                        {meeting.client.fullName}
                      </Link>
                      <StatusChip status={meeting.client.status} />
                      <span className="chip border-line bg-cream-deep text-ink-soft">
                        {MEETING_TYPE_LABEL[meeting.type]}
                      </span>
                    </p>
                    {meeting.attendees ? (
                      <p className="mt-1 text-xs text-ink-mute">With {meeting.attendees}</p>
                    ) : null}
                    {meeting.summary ? (
                      <p className="mt-2 line-clamp-3 whitespace-pre-wrap text-sm text-ink-soft">{meeting.summary}</p>
                    ) : null}
                  </div>
                  <p className="shrink-0 text-right text-sm tabular text-ink-mute">
                    {formatDateTime(meeting.occurredAt)}
                    <span className="block text-xs">{meeting.createdBy?.name ?? 'Import'}</span>
                  </p>
                </div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
