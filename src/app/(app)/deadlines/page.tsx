import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui/page-header';
import { CountryChip, StatusChip } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { PRE_FILING_STATUSES } from '@/lib/pipeline';
import { FEE_INCREASE_DATE, INVESTMENT_INCREASE_DATE, daysUntil, formatDate } from '@/lib/dates';
import { formatCents } from '@/lib/money';
import { isRetrogressionCountry } from '@/lib/labels';

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

  const feeDays = daysUntil(FEE_INCREASE_DATE);
  const investmentDays = daysUntil(INVESTMENT_INCREASE_DATE);

  return (
    <>
      <PageHeader
        eyebrow="Work queue"
        title="Deadline watchlist"
        description="Prospects, engaged clients and funded investors who have not filed an I-526E yet. These are the cases the two 2026–27 deadlines actually bite."
      />

      <div className="mb-8 grid gap-4 sm:grid-cols-2">
        <DeadlineCard
          title="I-526E filing fee increase"
          date={FEE_INCREASE_DATE}
          days={feeDays}
          detail="File before this date to avoid the higher USCIS fee."
        />
        <DeadlineCard
          title="Minimum investment increase"
          date={INVESTMENT_INCREASE_DATE}
          days={investmentDays}
          detail="TEA minimum rises from $800,000 to roughly $937,500."
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
                    <td>
                      <Link href={`/clients/${client.id}`} className="font-medium text-ink hover:text-pink-deep">
                        {client.fullName}
                      </Link>
                      <span className="block text-xs text-ink-mute tabular">{client.reference}</span>
                    </td>
                    <td>
                      <StatusChip status={client.status} />
                    </td>
                    <td className="text-sm">
                      <CountryChip
                        country={client.countryOfBirth}
                        flagged={isRetrogressionCountry(client.countryOfBirth)}
                      />
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

function DeadlineCard({ title, date, days, detail }: { title: string; date: Date; days: number | null; detail: string }) {
  const passed = days !== null && days < 0;
  const urgent = days !== null && days >= 0 && days <= 60;

  return (
    <div
      className={`rounded-xl2 border px-6 py-5 ${
        passed ? 'border-line bg-cream-deep/40' : urgent ? 'border-pink/35 bg-pink-wash/50' : 'border-line bg-cream-warm'
      }`}
    >
      <p className="eyebrow">{title}</p>
      <p className="mt-2 font-serif text-2xl font-medium">{formatDate(date)}</p>
      <p className={`mt-1 text-sm font-semibold tabular ${urgent ? 'text-pink-deep' : 'text-ink-mute'}`}>
        {passed ? 'Deadline passed' : `${days} days remaining`}
      </p>
      <p className="mt-2 text-sm text-ink-mute">{detail}</p>
    </div>
  );
}
