import Link from 'next/link';
import type { Metadata } from 'next';
import { getFilterOptions, listClients, PAGE_SIZE } from '@/lib/queries/clients';
import { PageHeader } from '@/components/ui/page-header';
import { ClientFilterBar } from '@/components/clients/filter-bar';
import { CountryChip, SourceChip, StatusChip } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';
import { formatCents } from '@/lib/money';
import { formatDate, relativeDays, daysUntil } from '@/lib/dates';
import { isRetrogressionCountry } from '@/lib/labels';

export const metadata: Metadata = { title: 'Clients' };
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

export default async function ClientsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const filters = {
    q: one(params, 'q'),
    status: one(params, 'status'),
    source: one(params, 'source'),
    centre: one(params, 'centre'),
    project: one(params, 'project'),
    country: one(params, 'country'),
    includeLost: one(params, 'lost') === '1',
    sort: one(params, 'sort'),
    page: Number(one(params, 'page') ?? '1') || 1,
  };

  const [{ rows, total, page, pageCount }, options] = await Promise.all([
    listClients(filters),
    getFilterOptions(),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Every prospect and investor"
        description="One record per applicant. Lost records stay searchable but drop out of the active list."
        actions={
          <Link href="/clients/new" className="btn-accent">
            New client
          </Link>
        }
      />

      <ClientFilterBar
        total={total}
        centres={options.centres.map((c) => ({ value: c.id, label: c.name }))}
        projects={options.projects.map((p) => ({ value: p.id, label: p.name }))}
        countries={options.countries.map((c) => ({ value: c.name, label: `${c.name} (${c.count})` }))}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No clients match those filters"
          description="Try clearing a filter, or add the first record."
          action={
            <Link href="/clients/new" className="btn-accent">
              New client
            </Link>
          }
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">Clients matching the current filters</caption>
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Country of birth</th>
                  <th scope="col">Project</th>
                  <th scope="col" className="text-right">Commission</th>
                  <th scope="col">Filed</th>
                  <th scope="col">Follow-up</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((client) => {
                  const commissionTotal = client.commissions.reduce((sum, c) => sum + c.amountCents, 0);
                  const outstanding = client.commissions
                    .filter((c) => c.status !== 'PAID')
                    .reduce((sum, c) => sum + c.amountCents, 0);
                  const overdueFollowUp = (daysUntil(client.followUpDate) ?? 1) <= 0;

                  return (
                    <tr key={client.id}>
                      <td>
                        <Link href={`/clients/${client.id}`} className="group block">
                          <span className="block font-medium text-ink group-hover:text-pink-deep">
                            {client.fullName}
                          </span>
                          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-ink-mute">
                            <span className="tabular">{client.reference}</span>
                            {client.email ? <span className="truncate">{client.email}</span> : null}
                          </span>
                        </Link>
                      </td>
                      <td>
                        <StatusChip status={client.status} />
                        <span className="mt-1 block">
                          <SourceChip source={client.source} />
                        </span>
                      </td>
                      <td className="text-sm">
                        <CountryChip
                          country={client.countryOfBirth}
                          flagged={isRetrogressionCountry(client.countryOfBirth)}
                        />
                      </td>
                      <td className="text-sm">
                        <span className="block text-ink-soft">{client.project?.name ?? '—'}</span>
                        <span className="block text-xs text-ink-mute">{client.regionalCentre?.name ?? '—'}</span>
                      </td>
                      <td className="text-right text-sm tabular">
                        <span className="block font-medium">{formatCents(commissionTotal || null)}</span>
                        {outstanding > 0 ? (
                          <span className="block text-xs text-stage-amber">{formatCents(outstanding)} outstanding</span>
                        ) : commissionTotal > 0 ? (
                          <span className="block text-xs text-stage-emerald">Settled</span>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap text-sm text-ink-soft">{formatDate(client.i526eFiledDate)}</td>
                      <td className="whitespace-nowrap text-sm">
                        {client.followUpDate ? (
                          <>
                            <span className={overdueFollowUp ? 'font-medium text-pink-deep' : 'text-ink-soft'}>
                              {formatDate(client.followUpDate)}
                            </span>
                            <span className="block text-xs text-ink-mute">{relativeDays(client.followUpDate)}</span>
                          </>
                        ) : (
                          <span className="text-ink-mute">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Pagination
        page={page}
        pageCount={pageCount}
        total={total}
        pageSize={PAGE_SIZE}
        baseParams={{
          q: filters.q,
          status: filters.status,
          source: filters.source,
          centre: filters.centre,
          project: filters.project,
          country: filters.country,
          lost: filters.includeLost ? '1' : undefined,
          sort: filters.sort,
        }}
      />
    </>
  );
}
