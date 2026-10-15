import Link from 'next/link';
import type { Metadata } from 'next';
import type { LeadSource } from '@prisma/client';
import { getLeadSourceBreakdown } from '@/lib/queries/lead-sources';
import { PageHeader } from '@/components/ui/page-header';
import { EmptyState } from '@/components/ui/empty-state';
import { formatCents } from '@/lib/money';
import { SOURCE_LABEL } from '@/lib/labels';
import { Alert } from '@/components/ui/alert';

export const metadata: Metadata = { title: 'Lead sources' };
export const dynamic = 'force-dynamic';

export default async function LeadSourcesPage() {
  const data = await getLeadSourceBreakdown();
  const googleAdsConfigured = !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN && !!process.env.GOOGLE_ADS_CUSTOMER_ID;
  const pending = data.conversions.filter((row) => row.status === 'PENDING').reduce((sum, row) => sum + row._count._all, 0);
  const sent = data.conversions.filter((row) => row.status === 'SENT').reduce((sum, row) => sum + row._count._all, 0);

  return (
    <>
      <PageHeader
        eyebrow="Insight"
        title="Where the money actually comes from"
        description="Count and funded rate by source, and by Google Ads campaign where attribution was captured."
      />

      {!googleAdsConfigured ? (
        <div className="mb-8">
          <Alert tone="info" title="Google Ads upload is not connected yet">
            Conversion events are being recorded ({pending} waiting, {sent} sent). Add the Google Ads credentials in{' '}
            <Link className="link" href="/settings">
              Settings
            </Link>{' '}
            and they will upload automatically.
          </Alert>
        </div>
      ) : null}

      <section className="mb-10">
        <h2 className="h-section mb-3">By source</h2>
        <SourceTable rows={data.sources} labelFor={(key) => SOURCE_LABEL[key as LeadSource] ?? key} />
      </section>

      <section>
        <h2 className="h-section mb-1">By Google Ads campaign</h2>
        <p className="mb-3 text-sm text-ink-mute">
          {data.withGclid} of {data.total} records carry a GCLID. Attribution is captured by the website enquiry form.
        </p>
        {data.campaigns.length === 0 ? (
          <EmptyState
            title="No campaign attribution yet"
            description="Install the lead-capture snippet on the website and campaigns will appear here."
            action={
              <Link href="/settings" className="btn-ghost">
                Get the snippet
              </Link>
            }
          />
        ) : (
          <SourceTable rows={data.campaigns} labelFor={(key) => key} />
        )}
      </section>
    </>
  );
}

function SourceTable({
  rows,
  labelFor,
}: {
  rows: Array<{ key: string; total: number; funded: number; lost: number; commissionCents: number; fundedRate: number }>;
  labelFor: (key: string) => string;
}) {
  if (rows.length === 0) return <EmptyState title="Nothing to report yet" />;
  const maxTotal = Math.max(...rows.map((row) => row.total));

  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table">
          <caption className="sr-only">Lead volume and funded rate by source</caption>
          <thead>
            <tr>
              <th scope="col">Source</th>
              <th scope="col">Volume</th>
              <th scope="col" className="text-right">Leads</th>
              <th scope="col" className="text-right">Funded or beyond</th>
              <th scope="col" className="text-right">Funded rate</th>
              <th scope="col" className="text-right">Commission booked</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.key}>
                <td className="font-medium">{labelFor(row.key)}</td>
                <td className="w-40">
                  <span className="block h-2 overflow-hidden rounded-full bg-cream-deep">
                    <span
                      className="block h-full rounded-full bg-pink"
                      style={{ width: `${Math.round((row.total / maxTotal) * 100)}%` }}
                    />
                  </span>
                </td>
                <td className="text-right tabular">{row.total}</td>
                <td className="text-right tabular">{row.funded}</td>
                <td className="text-right tabular font-medium">{row.fundedRate}%</td>
                <td className="text-right tabular">{formatCents(row.commissionCents || null)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
