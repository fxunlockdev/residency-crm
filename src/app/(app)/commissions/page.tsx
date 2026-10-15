import Link from 'next/link';
import type { Metadata } from 'next';
import type { CommissionStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { CommissionChip } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { Metric } from '@/components/ui/metric';
import { formatCents } from '@/lib/money';
import { formatDate, relativeDays, todayUtc } from '@/lib/dates';
import { COMMISSION_STATUS_LABEL, COMMISSION_TRIGGER_LABEL } from '@/lib/labels';
import { advanceCommissionAction } from '@/server/commission-actions';

export const metadata: Metadata = { title: 'Commissions' };
export const dynamic = 'force-dynamic';

type SearchParams = Record<string, string | string[] | undefined>;

function one(params: SearchParams, key: string): string | undefined {
  const value = params[key];
  return Array.isArray(value) ? value[0] : value;
}

const VIEWS = [
  { key: 'action', label: 'Needs action' },
  { key: 'overdue', label: 'Overdue' },
  { key: 'all', label: 'All' },
] as const;

export default async function CommissionsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const params = await searchParams;
  const view = one(params, 'view') ?? (one(params, 'status') ? 'all' : 'action');
  const statusFilter = one(params, 'status') as CommissionStatus | undefined;
  const today = todayUtc();
  const user = await getCurrentUser();
  const canEdit = !!user && hasRole(user, 'ADVISOR');

  const where: Prisma.CommissionWhereInput =
    statusFilter
      ? { status: statusFilter }
      : view === 'overdue'
        ? { status: 'INVOICED', paymentDueDate: { lt: today } }
        : view === 'all'
          ? {}
          : { status: { in: ['DUE', 'INVOICED', 'DISPUTED'] } };

  const [commissions, totals, overdueRows] = await Promise.all([
    prisma.commission.findMany({
      where,
      orderBy: [{ paymentDueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }],
      include: {
        client: { select: { id: true, fullName: true, reference: true, status: true } },
        regionalCentre: { select: { id: true, name: true } },
      },
    }),
    prisma.commission.groupBy({ by: ['status'], _sum: { amountCents: true }, _count: { _all: true } }),
    prisma.commission.findMany({
      where: { status: 'INVOICED', paymentDueDate: { lt: today } },
      select: { id: true, amountCents: true },
    }),
  ]);

  const byStatus = new Map(totals.map((row) => [row.status, { cents: row._sum.amountCents ?? 0, count: row._count._all }]));
  const overdueCents = overdueRows.reduce((sum, row) => sum + row.amountCents, 0);

  // Invoices go to the regional centre, so that is how the queue is grouped.
  const groups = new Map<string, { name: string; rows: typeof commissions }>();
  for (const commission of commissions) {
    const key = commission.regionalCentre?.id ?? 'unassigned';
    const name = commission.regionalCentre?.name ?? 'No regional centre';
    if (!groups.has(key)) groups.set(key, { name, rows: [] });
    groups.get(key)!.rows.push(commission);
  }
  const sortedGroups = [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));

  return (
    <>
      <PageHeader
        eyebrow="Money"
        title="Commission pipeline"
        description="Invoices go to the regional centre, not the client. Anything invoiced and past its due date is flagged overdue."
      />

      <section className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Due to invoice"
          value={formatCents(byStatus.get('DUE')?.cents ?? 0)}
          sub={`${byStatus.get('DUE')?.count ?? 0} commissions`}
          tone={byStatus.get('DUE')?.count ? 'accent' : 'default'}
        />
        <Metric
          label="Invoiced, awaiting payment"
          value={formatCents(byStatus.get('INVOICED')?.cents ?? 0)}
          sub={`${byStatus.get('INVOICED')?.count ?? 0} invoices`}
        />
        <Metric
          label="Overdue"
          value={formatCents(overdueCents)}
          sub={`${overdueRows.length} past the due date`}
          tone={overdueRows.length ? 'alert' : 'default'}
        />
        <Metric
          label="Received"
          value={formatCents(byStatus.get('PAID')?.cents ?? 0)}
          sub={`${byStatus.get('PAID')?.count ?? 0} payments`}
        />
      </section>

      <nav className="mb-6 flex flex-wrap items-center gap-2" aria-label="Commission views">
        {VIEWS.map((item) => (
          <Link
            key={item.key}
            href={item.key === 'action' ? '/commissions' : `/commissions?view=${item.key}`}
            className={view === item.key && !statusFilter ? 'btn-primary' : 'btn-ghost'}
          >
            {item.label}
          </Link>
        ))}
        <span aria-hidden className="mx-1 h-5 w-px bg-line" />
        {(['DUE', 'INVOICED', 'PAID', 'NOT_DUE', 'DISPUTED'] as CommissionStatus[]).map((status) => (
          <Link
            key={status}
            href={`/commissions?status=${status}`}
            className={statusFilter === status ? 'btn-primary' : 'btn-ghost'}
          >
            {COMMISSION_STATUS_LABEL[status]}
          </Link>
        ))}
      </nav>

      {commissions.length === 0 ? (
        <EmptyState
          title="Nothing in this view"
          description="Commissions become due automatically when a client reaches the matching stage."
        />
      ) : (
        <div className="space-y-8">
          {sortedGroups.map((group) => {
            const groupTotal = group.rows.reduce((sum, row) => sum + row.amountCents, 0);
            return (
              <section key={group.name} aria-labelledby={`centre-${group.name}`}>
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id={`centre-${group.name}`} className="h-section">
                    {group.name}
                  </h2>
                  <p className="text-sm text-ink-mute tabular">
                    {group.rows.length} commission{group.rows.length === 1 ? '' : 's'} · {formatCents(groupTotal)}
                  </p>
                </div>

                <div className="surface overflow-hidden">
                  <div className="overflow-x-auto">
                    <table className="data-table">
                      <caption className="sr-only">Commissions invoiced to {group.name}</caption>
                      <thead>
                        <tr>
                          <th scope="col">Client</th>
                          <th scope="col">Trigger</th>
                          <th scope="col" className="text-right">Amount</th>
                          <th scope="col">Status</th>
                          <th scope="col">Invoice</th>
                          <th scope="col">Due</th>
                          {canEdit ? <th scope="col" className="text-right">Action</th> : null}
                        </tr>
                      </thead>
                      <tbody>
                        {group.rows.map((commission) => {
                          const overdue =
                            commission.status === 'INVOICED' &&
                            !!commission.paymentDueDate &&
                            commission.paymentDueDate < today;

                          return (
                            <tr key={commission.id}>
                              <td>
                                <Link
                                  href={`/clients/${commission.client.id}`}
                                  className="font-medium text-ink hover:text-pink-deep"
                                >
                                  {commission.client.fullName}
                                </Link>
                                <span className="block text-xs text-ink-mute tabular">
                                  {commission.client.reference}
                                </span>
                              </td>
                              <td className="text-sm text-ink-soft">
                                {COMMISSION_TRIGGER_LABEL[commission.trigger]}
                              </td>
                              <td className="text-right text-sm font-medium tabular">
                                {formatCents(commission.amountCents)}
                              </td>
                              <td>
                                <CommissionChip status={commission.status} overdue={overdue} />
                              </td>
                              <td className="text-sm text-ink-soft">
                                {commission.invoiceNumber ?? '—'}
                                {commission.invoiceSentDate ? (
                                  <span className="block text-xs text-ink-mute">
                                    sent {formatDate(commission.invoiceSentDate)}
                                  </span>
                                ) : null}
                              </td>
                              <td className="whitespace-nowrap text-sm">
                                {commission.paymentDueDate ? (
                                  <>
                                    <span className={overdue ? 'font-medium text-pink-deep' : 'text-ink-soft'}>
                                      {formatDate(commission.paymentDueDate)}
                                    </span>
                                    <span className="block text-xs text-ink-mute">
                                      {relativeDays(commission.paymentDueDate)}
                                    </span>
                                  </>
                                ) : (
                                  <span className="text-ink-mute">—</span>
                                )}
                              </td>
                              {canEdit ? (
                                <td className="text-right">
                                  <NextStep status={commission.status} commissionId={commission.id} />
                                </td>
                              ) : null}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              </section>
            );
          })}
        </div>
      )}
    </>
  );
}

function NextStep({ status, commissionId }: { status: CommissionStatus; commissionId: string }) {
  const next: Partial<Record<CommissionStatus, { label: string; value: CommissionStatus }>> = {
    NOT_DUE: { label: 'Mark due', value: 'DUE' },
    DUE: { label: 'Mark invoiced', value: 'INVOICED' },
    INVOICED: { label: 'Mark paid', value: 'PAID' },
    DISPUTED: { label: 'Mark paid', value: 'PAID' },
  };
  const step = next[status];
  if (!step) return <span className="text-xs text-ink-mute">Settled</span>;

  return (
    <form action={advanceCommissionAction} className="inline">
      <input type="hidden" name="commissionId" value={commissionId} />
      <input type="hidden" name="status" value={step.value} />
      <button type="submit" className="btn-quiet whitespace-nowrap">
        {step.label}
      </button>
    </form>
  );
}
