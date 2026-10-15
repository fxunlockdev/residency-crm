import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { formatDateTime } from '@/lib/dates';
import { STATUS_LABEL } from '@/lib/pipeline';
import type { ClientStatus } from '@prisma/client';

export const metadata: Metadata = { title: 'Activity log' };
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 60;

export default async function ActivityPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const pageParam = Array.isArray(params.page) ? params.page[0] : params.page;
  const page = Math.max(1, Number(pageParam ?? '1') || 1);
  const onlyStatus = (Array.isArray(params.filter) ? params.filter[0] : params.filter) === 'status';

  const where = onlyStatus ? { action: 'status_changed' } : {};
  const [entries, total] = await Promise.all([
    prisma.auditLog.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.auditLog.count({ where }),
  ]);

  const pageCount = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <>
      <PageHeader
        eyebrow="Audit"
        title="Activity log"
        description="Who changed what, and when. Status changes are kept for reporting and for the Google Ads offline conversion uploads."
        actions={
          <>
            <Link href="/activity" className={onlyStatus ? 'btn-ghost' : 'btn-primary'}>
              Everything
            </Link>
            <Link href="/activity?filter=status" className={onlyStatus ? 'btn-primary' : 'btn-ghost'}>
              Status changes
            </Link>
          </>
        }
      />

      {entries.length === 0 ? (
        <EmptyState title="Nothing recorded yet" />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">Audit log entries, newest first</caption>
              <thead>
                <tr>
                  <th scope="col">When</th>
                  <th scope="col">Who</th>
                  <th scope="col">What happened</th>
                  <th scope="col">Change</th>
                </tr>
              </thead>
              <tbody>
                {entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="whitespace-nowrap text-sm tabular text-ink-mute">
                      {formatDateTime(entry.createdAt)}
                    </td>
                    <td className="whitespace-nowrap text-sm">{entry.actorLabel ?? 'System'}</td>
                    <td className="text-sm">
                      {entry.entity === 'Client' && entry.entityId !== 'import' ? (
                        <Link href={`/clients/${entry.entityId}`} className="text-ink hover:text-pink-deep">
                          {entry.summary ?? `${entry.entity} ${entry.action}`}
                        </Link>
                      ) : (
                        <span className="text-ink-soft">{entry.summary ?? `${entry.entity} ${entry.action}`}</span>
                      )}
                    </td>
                    <td className="text-sm text-ink-mute">
                      {entry.field ? (
                        <span>
                          <span className="font-medium">{entry.field}</span>: {display(entry.field, entry.oldValue)} →{' '}
                          {display(entry.field, entry.newValue)}
                        </span>
                      ) : (
                        '—'
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {pageCount > 1 ? (
        <nav className="mt-6 flex items-center justify-between text-sm" aria-label="Pagination">
          <p className="text-ink-mute tabular">
            Page {page} of {pageCount} · {total} entries
          </p>
          <span className="flex gap-2">
            {page > 1 ? (
              <Link
                href={`/activity?${onlyStatus ? 'filter=status&' : ''}page=${page - 1}`}
                className="btn-ghost"
              >
                ← Previous
              </Link>
            ) : null}
            {page < pageCount ? (
              <Link
                href={`/activity?${onlyStatus ? 'filter=status&' : ''}page=${page + 1}`}
                className="btn-ghost"
              >
                Next →
              </Link>
            ) : null}
          </span>
        </nav>
      ) : null}
    </>
  );
}

function display(field: string, value: string | null): string {
  if (!value) return 'empty';
  if (field === 'status') return STATUS_LABEL[value as ClientStatus] ?? value;
  return value;
}
