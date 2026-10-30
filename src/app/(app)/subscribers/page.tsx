import type { Metadata } from 'next';
import Link from 'next/link';
import { hasRole, requireRole } from '@/lib/auth';
import { formatDate } from '@/lib/dates';
import { PageHeader } from '@/components/ui/page-header';
import { Metric } from '@/components/ui/metric';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { listSubscribers, readFilters, subscriberTotals, PAGE_SIZE } from '@/lib/queries/subscribers';
import { SubscriberFilterBar } from '@/components/subscribers/filter-bar';

export const metadata: Metadata = { title: 'Updates list' };

type Search = Record<string, string | string[] | undefined>;

export default async function SubscribersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const user = await requireRole('VIEWER');

  const params = await searchParams;
  const filters = readFilters(params);
  const page = Math.max(1, Number(Array.isArray(params.page) ? params.page[0] : params.page) || 1);

  const [{ rows, total, pageCount }, totals] = await Promise.all([
    listSubscribers(filters, page),
    subscriberTotals(),
  ]);

  const exportQuery = new URLSearchParams({ channel: filters.channel, status: filters.status });
  if (filters.q) exportQuery.set('q', filters.q);

  return (
    <>
      <PageHeader
        eyebrow="Website"
        title="EB-5 updates list"
        description="Everyone who filled in the updates signup on the website, with the channels they agreed to. Email goes out from Newsletter; export the WhatsApp list to send a broadcast until the CRM can send it directly."
        actions={
          <>
            <Link href="/newsletter/new" className="btn-primary">
              Write a newsletter
            </Link>
            {hasRole(user, 'ADVISOR') ? (
              <a href={`/api/subscribers/export?${exportQuery.toString()}`} className="btn-quiet">
                Export CSV
              </a>
            ) : null}
          </>
        }
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Metric label="Email" value={String(totals.email)} sub="Reachable by newsletter" />
        <Metric label="WhatsApp" value={String(totals.whatsapp)} sub="Gave a number and consent" />
        <Metric label="Both channels" value={String(totals.both)} sub="Counted in each above" />
        <Metric label="Unsubscribed" value={String(totals.unsubscribed)} sub="Kept as a record of consent" />
      </div>

      <SubscriberFilterBar total={total} />

      {rows.length === 0 ? (
        <EmptyState
          title="Nobody here yet"
          description="The signup on the website writes straight into this list. Nothing is added by hand."
        />
      ) : (
        <>
          <div className="surface overflow-x-auto">
            <table className="data-table min-w-[52rem]">
              <thead>
                <tr>
                  <th scope="col">Name</th>
                  <th scope="col">Email</th>
                  <th scope="col">WhatsApp</th>
                  <th scope="col">Wants</th>
                  <th scope="col">Joined</th>
                  <th scope="col">From</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.id} className={row.unsubscribedAt ? 'opacity-55' : undefined}>
                    <td>
                      {row.name ?? <span className="text-ink-mute">Not given</span>}
                      {row.unsubscribedAt ? (
                        <span className="ml-2 chip">Unsubscribed {formatDate(row.unsubscribedAt)}</span>
                      ) : null}
                    </td>
                    <td className="break-words">{row.email ?? <span className="text-ink-mute">—</span>}</td>
                    <td className="tabular">{row.phone ?? <span className="text-ink-mute">—</span>}</td>
                    <td>{wants(row.consentEmail, row.consentWhatsapp)}</td>
                    <td className="tabular whitespace-nowrap">{formatDate(row.createdAt)}</td>
                    <td className="text-ink-mute">{row.sourcePath ?? row.signupType}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <Pagination
            page={page}
            pageCount={pageCount}
            total={total}
            pageSize={PAGE_SIZE}
            baseParams={{ channel: filters.channel, status: filters.status, q: filters.q || undefined }}
          />
        </>
      )}

      <p className="mt-8 text-xs leading-relaxed text-ink-mute">
        Each row records the exact consent wording the subscriber was shown and when they agreed to it. An
        unsubscribed row is kept rather than deleted, because it is the evidence that they asked to stop.
      </p>
    </>
  );
}

function wants(email: boolean, whatsapp: boolean) {
  const channels = [email ? 'Email' : null, whatsapp ? 'WhatsApp' : null].filter(Boolean);
  if (channels.length === 0) return <span className="text-ink-mute">Neither</span>;
  return <span className="chip">{channels.join(' + ')}</span>;
}
