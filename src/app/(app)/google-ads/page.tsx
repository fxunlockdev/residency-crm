import Link from 'next/link';
import type { Metadata } from 'next';
import { requireUser } from '@/lib/auth';
import { getAdPerformance } from '@/lib/queries/ad-performance';
import { PageHeader } from '@/components/ui/page-header';
import { Metric } from '@/components/ui/metric';
import { Alert } from '@/components/ui/alert';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCents } from '@/lib/money';
import { formatDate } from '@/lib/dates';
import { MATURATION_MONTHS, monthLabel } from '@/lib/ad-cohorts';

export const metadata: Metadata = { title: 'Google Ads' };
export const dynamic = 'force-dynamic';

export default async function GoogleAdsPage() {
  await requireUser();
  const data = await getAdPerformance();

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="What the ads actually bought"
        description="Spend next to investors won. Everything is grouped by the month the lead arrived, not the month it converted — an EB-5 deal takes months to close, so the two are never the same."
        actions={
          <Link href="/lead-sources" className="btn-ghost">
            All lead sources
          </Link>
        }
      />

      {!data.configured ? (
        <div className="mb-8">
          <Alert tone="info" title="Google Ads is not connected yet">
            Add the <code className="rounded bg-cream-deep px-1">GOOGLE_ADS_*</code> variables in Railway, then the
            daily pull at <code className="rounded bg-cream-deep px-1">/api/cron/google-ads-spend</code> will start
            filling this page.
          </Alert>
        </div>
      ) : null}

      {data.currencyMismatch ? (
        <div className="mb-8">
          <Alert tone="warning" title={`Your Ads account bills in ${data.currencyCode}`}>
            Commissions are recorded in USD, so cost-per-investor and return on spend below are comparing two
            currencies. Treat them as indicative until a conversion rate is applied.
          </Alert>
        </div>
      ) : null}

      {data.configured && data.totalLeads > 0 && data.attributedLeads === 0 ? (
        <div className="mb-8">
          <Alert tone="warning" title="No lead carries a campaign yet">
            None of your {data.totalLeads} client records has a campaign id, so spend cannot be tied to outcomes. That
            starts once the lead snippet is live on the website and the Google Ads final URL suffix includes{' '}
            <code className="rounded bg-cream-deep px-1">campaignid={'{campaignid}'}</code>.
          </Alert>
        </div>
      ) : null}

      <section aria-label="Totals" className="mb-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Spend" value={formatCents(data.totals.costCents)} sub="across all campaigns" />
        <Metric label="Attributed leads" value={String(data.totals.leads)} sub={`of ${data.totalLeads} records`} />
        <Metric label="Funded from ads" value={String(data.totals.funded)} />
        <Metric
          label="Commission booked"
          value={formatCents(data.totals.commissionCents)}
          sub={
            data.totals.costCents > 0
              ? `${(data.totals.commissionCents / data.totals.costCents).toFixed(2)}x spend`
              : 'no spend recorded'
          }
          tone={data.totals.commissionCents > 0 ? 'accent' : 'default'}
        />
      </section>

      <section aria-labelledby="campaigns-heading" className="mb-10">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 id="campaigns-heading" className="h-section">
            By campaign
          </h2>
          {data.lastPulledAt ? (
            <p className="text-sm text-ink-mute">Spend last pulled {formatDate(data.lastPulledAt)}</p>
          ) : null}
        </div>

        {data.campaigns.length === 0 ? (
          <EmptyState
            title="No campaign spend yet"
            description="The daily pull writes here once Google Ads is connected."
          />
        ) : (
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <caption className="sr-only">Spend and outcomes by Google Ads campaign</caption>
                <thead>
                  <tr>
                    <th scope="col">Campaign</th>
                    <th scope="col" className="text-right">Spend</th>
                    <th scope="col" className="text-right">Clicks</th>
                    <th scope="col" className="text-right">Leads</th>
                    <th scope="col" className="text-right">Cost / lead</th>
                    <th scope="col" className="text-right">Funded</th>
                    <th scope="col" className="text-right">Cost / investor</th>
                    <th scope="col" className="text-right">Commission</th>
                    <th scope="col" className="text-right">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {data.campaigns.map((row) => (
                    <tr key={row.campaignId}>
                      <th scope="row" className="text-left">
                        <span className="block truncate font-medium">{row.campaignName}</span>
                        {row.status && row.status !== 'ENABLED' ? (
                          <span className="chip mt-1 border-line bg-cream-deep text-ink-mute">
                            {row.status.toLowerCase()}
                          </span>
                        ) : null}
                      </th>
                      <td className="text-right tabular">{formatCents(row.costCents)}</td>
                      <td className="text-right tabular text-ink-mute">{row.clicks.toLocaleString('en-US')}</td>
                      <td className="text-right tabular">{row.leads}</td>
                      <td className="text-right tabular">{formatCents(row.costPerLeadCents)}</td>
                      <td className="text-right tabular">{row.funded}</td>
                      <td className="text-right tabular">{formatCents(row.costPerFundedCents)}</td>
                      <td className="text-right tabular">{formatCents(row.commissionCents || null)}</td>
                      <td className="text-right tabular font-medium">
                        {row.returnOnSpend === null ? (
                          <span className="text-ink-mute">—</span>
                        ) : (
                          <span className={row.returnOnSpend >= 1 ? 'text-stage-emerald' : 'text-stage-amber'}>
                            {row.returnOnSpend.toFixed(2)}x
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>

      <section aria-labelledby="cohorts-heading">
        <h2 id="cohorts-heading" className="h-section mb-1">
          By the month the lead arrived
        </h2>
        <p className="mb-3 max-w-3xl text-sm text-ink-mute">
          A lead takes roughly {MATURATION_MONTHS} months to become a funded investor, so recent months are marked
          still maturing. Their cost per investor is not a real number yet — read them as incomplete, not as failures.
        </p>

        {data.cohorts.length === 0 ? (
          <EmptyState title="Nothing to cohort yet" />
        ) : (
          <div className="surface overflow-hidden">
            <div className="overflow-x-auto">
              <table className="data-table">
                <caption className="sr-only">Spend and outcomes by lead month</caption>
                <thead>
                  <tr>
                    <th scope="col">Lead month</th>
                    <th scope="col" className="text-right">Spend</th>
                    <th scope="col" className="text-right">Leads</th>
                    <th scope="col" className="text-right">Engaged</th>
                    <th scope="col" className="text-right">Funded</th>
                    <th scope="col" className="text-right">Cost / investor</th>
                    <th scope="col" className="text-right">Return</th>
                  </tr>
                </thead>
                <tbody>
                  {data.cohorts.map((row) => (
                    <tr key={row.month} className={row.maturing ? 'opacity-70' : undefined}>
                      <th scope="row" className="whitespace-nowrap text-left">
                        {monthLabel(row.month)}
                        {row.maturing ? (
                          <span className="chip ml-2 border-line bg-cream-deep text-ink-mute">still maturing</span>
                        ) : null}
                      </th>
                      <td className="text-right tabular">{formatCents(row.costCents)}</td>
                      <td className="text-right tabular">{row.leads}</td>
                      <td className="text-right tabular">{row.engaged}</td>
                      <td className="text-right tabular">{row.funded}</td>
                      <td className="text-right tabular">
                        {row.maturing && row.funded === 0 ? (
                          <span className="text-ink-mute">too early</span>
                        ) : (
                          formatCents(row.costPerFundedCents)
                        )}
                      </td>
                      <td className="text-right tabular font-medium">
                        {row.maturing && row.funded === 0 ? (
                          <span className="text-ink-mute">too early</span>
                        ) : row.returnOnSpend === null ? (
                          <span className="text-ink-mute">—</span>
                        ) : (
                          `${row.returnOnSpend.toFixed(2)}x`
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
