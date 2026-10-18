import Link from 'next/link';
import type { Metadata } from 'next';
import { getFilterOptions, listClients, PAGE_SIZE, RETROGRESSION_FILTER } from '@/lib/queries/clients';
import { getTableLayout } from '@/lib/queries/table-prefs';
import { getCurrentUser } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { ClientFilterBar } from '@/components/clients/filter-bar';
import { ColumnPicker } from '@/components/clients/column-picker';
import { ClientsTable, type ClientRow } from '@/components/clients/clients-table';
import { EmptyState } from '@/components/ui/empty-state';
import { Pagination } from '@/components/ui/pagination';

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

  const user = await getCurrentUser();
  const [{ rows, total, page, pageCount }, options, layout] = await Promise.all([
    listClients(filters),
    getFilterOptions(),
    getTableLayout(user?.id),
  ]);

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Every prospect and investor"
        description="One record per applicant. Lost records stay searchable but drop out of the active list."
        actions={
          <>
            <ColumnPicker columns={layout.columns} />
            <Link href="/clients/new" className="btn-accent">
              New client
            </Link>
          </>
        }
      />

      <ClientFilterBar
        total={total}
        centres={options.centres.map((c) => ({ value: c.id, label: c.name }))}
        projects={options.projects.map((p) => ({ value: p.id, label: p.name }))}
        countries={[
          { value: RETROGRESSION_FILTER, label: 'Retrogression countries (India, China)' },
          ...options.countries.map((c) => ({ value: c.name, label: `${c.name} (${c.count})` })),
        ]}
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
        <ClientsTable rows={rows as ClientRow[]} columns={layout.columns} widths={layout.widths} />
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
