import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { PRE_FILING_STATUSES } from '@/lib/pipeline';
import { FEE_INCREASE_DATE, INVESTMENT_INCREASE_DATE, formatDate } from '@/lib/dates';
import { DeadlineSummary } from '@/components/ui/deadline-summary';
import { formatCents } from '@/lib/money';

export const metadata: Metadata = { title: 'Deadlines' };
export const dynamic = 'force-dynamic';

export default async function DeadlinesPage() {
  const clients = await prisma.client.findMany({
    where: { status: { in: PRE_FILING_STATUSES } },
    orderBy: [{ status: 'desc' }, { followUpDate: { sort: 'asc', nulls: 'last' } }],
    select: {
      id: true,
      reference: true,
      fullName: true,
      status: true,
      countryOfBirth: true,
      dateFunded: true,
      investmentAmountCents: true,
      followUpDate: true,
      nextAction: true,
      project: { select: { name: true } },
    },
  });

  return (
    <>
      <PageHeader
        eyebrow="Work queue"
        title="Deadline watchlist"
        description="Prospects, engaged clients and funded investors who have not filed an I-526E yet. These are the cases the two 2026–27 deadlines actually bite."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <DeadlineSummary
          variant="card"
          label="I-526E filing fee increase"
          date={FEE_INCREASE_DATE}
          note="File before this date to avoid the higher USCIS fee."
        />
        <DeadlineSummary
          variant="card"
          label="Minimum investment increase"
          date={INVESTMENT_INCREASE_DATE}
          note="TEA minimum rises from $800,000 to roughly $937,500."
        />
      </div>

      {clients.length === 0 ? (
        <EmptyState
          title="Nothing waiting to file"
          description="Every active client has already filed an I-526E."
          action={
            <Link href="/clients" className="btn-ghost">
              Browse clients
            </Link>
          }
        />
      ) : (
        <div className="surface overflow-hidden">
          <div className="overflow-x-auto">
            <table className="data-table">
              <caption className="sr-only">Clients who have not filed an I-526E</caption>
              <thead>
                <tr>
                  <th scope="col">Client</th>
                  <th scope="col">Stage</th>
                  <th scope="col">Country of birth</th>
                  <th scope="col">Project</th>
                  <th scope="col">Funded</th>
                  <th scope="col" className="text-right">Investment</th>
                  <th scope="col">Next action</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((client) => (
                  <tr key={client.id}>
                    <th scope="row" className="text-left font-normal">
                      <Link href={`/clients/${client.id}`} className="font-medium text-ink hover:text-pink-deep">
                        {client.fullName}
                      </Link>
                      <span className="block text-xs text-ink-mute tabular">{client.reference}</span>
                    </th>
                    <td>
                      <StatusChip status={client.status} />
                    </td>
                    <td className="whitespace-nowrap text-sm text-ink-soft">
                      {client.countryOfBirth ?? '—'}
                    </td>
                    <td className="text-sm text-ink-soft">{client.project?.name ?? '—'}</td>
                    <td className="whitespace-nowrap text-sm text-ink-soft">{formatDate(client.dateFunded)}</td>
                    <td className="text-right text-sm tabular">{formatCents(client.investmentAmountCents)}</td>
                    <td className="text-sm text-ink-mute">{client.nextAction ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </>
  );
}

