import Link from 'next/link';
import type { Metadata } from 'next';
import { getDashboard } from '@/lib/queries/dashboard';
import { Metric } from '@/components/ui/metric';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/chips';
import { formatCents, formatCentsCompact } from '@/lib/money';
import { daysUntil, formatDate, relativeDays } from '@/lib/dates';
import { STATUS_SHORT_LABEL, STATUS_TONE } from '@/lib/pipeline';

export const metadata: Metadata = { title: 'Dashboard' };
export const dynamic = 'force-dynamic';

const BAR_TONE: Record<string, string> = {
  slate: 'bg-stage-slate',
  sky: 'bg-stage-sky',
  amber: 'bg-stage-amber',
  violet: 'bg-stage-violet',
  emerald: 'bg-stage-emerald',
  rose: 'bg-stage-rose',
};

export default async function DashboardPage() {
  const data = await getDashboard();
  const maxStage = Math.max(1, ...data.pipeline.map((stage) => stage.count));
  const feeDays = daysUntil(data.deadlines.feeIncrease.date);
  const investmentDays = daysUntil(data.deadlines.investmentIncrease.date);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Where every case stands today"
        description="Live pipeline, the money owed to Residency First, and what needs chasing before the next statutory deadline."
        actions={
          <>
            <Link href="/clients/new" className="btn-accent">
              New client
            </Link>
            <Link href="/pipeline" className="btn-ghost">
              Pipeline board
            </Link>
          </>
        }
      />

      <section aria-label="Key figures" className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Active clients"
          value={String(data.activeClients)}
          sub={`${data.wonClients} funded or beyond`}
          href="/clients"
        />
        <Metric
          label="Commission due"
          value={formatCents(data.commission.due.cents)}
          sub={`${data.commission.due.count} ready to invoice`}
          href="/commissions?status=DUE"
          tone={data.commission.due.count ? 'accent' : 'default'}
        />
        <Metric
          label="Overdue"
          value={formatCents(data.commission.overdue.cents)}
          sub={`${data.commission.overdue.count} invoices past their due date`}
          href="/commissions?view=overdue"
          tone={data.commission.overdue.count ? 'alert' : 'default'}
        />
        <Metric
          label="Collected to date"
          value={formatCentsCompact(data.commission.paid.cents)}
          sub={`${data.commission.paid.count} payments received`}
          href="/commissions?status=PAID"
        />
      </section>

      {/* Statutory deadlines */}
      <section aria-labelledby="deadlines-heading" className="mt-10">
        <div className="surface overflow-hidden">
          <div className="flex flex-col gap-6 px-6 py-6 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 id="deadlines-heading" className="font-serif text-lg font-medium">
                Two dates that change the maths
              </h2>
              <p className="mt-1 max-w-xl text-sm text-ink-mute">
                {data.deadlines.feeIncrease.atRisk} client
                {data.deadlines.feeIncrease.atRisk === 1 ? ' has' : 's have'} not filed an I-526E yet.
              </p>
            </div>
            <Link href="/deadlines" className="btn-ghost shrink-0">
              Open deadline watchlist
            </Link>
          </div>

          <div className="grid border-t border-line sm:grid-cols-2">
            <DeadlineCell
              label="Filing fee increase"
              date={formatDate(data.deadlines.feeIncrease.date)}
              days={feeDays}
              note="File the I-526E before this date to avoid the higher fee."
            />
            <DeadlineCell
              label="Investment increase"
              date={formatDate(data.deadlines.investmentIncrease.date)}
              days={investmentDays}
              note="TEA minimum rises from $800k to roughly $937.5k."
              bordered
            />
          </div>
        </div>
      </section>

      <div className="mt-10 grid gap-6 lg:grid-cols-[1.15fr_1fr]">
        {/* Pipeline distribution */}
        <section aria-labelledby="pipeline-heading" className="surface p-6">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 id="pipeline-heading" className="font-serif text-lg font-medium">
              Pipeline
            </h2>
            <Link href="/pipeline" className="btn-quiet">
              Board view →
            </Link>
          </div>
          <ul className="space-y-2.5">
            {data.pipeline.map((stage) => (
              <li key={stage.status}>
                <Link
                  href={`/clients?status=${stage.status}`}
                  className="group grid grid-cols-[9.5rem_1fr_2.5rem] items-center gap-3 rounded-lg px-2 py-1.5 transition-colors duration-200 hover:bg-cream-deep"
                >
                  <span
                    className={`truncate text-sm group-hover:text-ink ${
                      stage.count === 0 ? 'text-ink-mute' : 'text-ink-soft'
                    }`}
                  >
                    {STATUS_SHORT_LABEL[stage.status]}
                  </span>
                  <span className="h-2 overflow-hidden rounded-full bg-cream-deep">
                    {stage.count > 0 ? (
                      <span
                        className={`block h-full rounded-full ${BAR_TONE[STATUS_TONE[stage.status]]}`}
                        style={{ width: `${Math.round((stage.count / maxStage) * 100)}%` }}
                      />
                    ) : null}
                  </span>
                  <span
                    className={`text-right text-sm tabular ${
                      stage.count === 0 ? 'text-ink-mute' : 'font-semibold text-ink'
                    }`}
                  >
                    {stage.count}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </section>

        {/* Follow-ups */}
        <section aria-labelledby="followups-heading" className="surface p-6">
          <div className="mb-5 flex items-baseline justify-between">
            <h2 id="followups-heading" className="font-serif text-lg font-medium">
              Follow-ups due
            </h2>
            <Link href="/follow-ups" className="btn-quiet">
              All →
            </Link>
          </div>

          {data.followUps.length === 0 ? (
            <p className="py-6 text-sm text-ink-mute">
              Nothing due today. Follow-up dates that fall due will appear here.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {data.followUps.map((client) => (
                <li key={client.id}>
                  <Link
                    href={`/clients/${client.id}`}
                    className="-mx-2 flex items-start justify-between gap-4 rounded-lg px-2 py-3 transition-colors duration-200 hover:bg-cream-deep"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-ink">{client.fullName}</span>
                      <span className="mt-0.5 block truncate text-xs text-ink-mute">
                        {client.nextAction ?? 'No next action recorded'}
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <StatusChip status={client.status} />
                      <span className="mt-1 block text-xs text-pink-deep">{relativeDays(client.followUpDate)}</span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* Recent activity */}
      <section aria-labelledby="activity-heading" className="mt-6 surface p-6">
        <div className="mb-5 flex items-baseline justify-between">
          <h2 id="activity-heading" className="font-serif text-lg font-medium">
            Recent activity
          </h2>
          <Link href="/activity" className="btn-quiet">
            Full log →
          </Link>
        </div>
        {data.recentActivity.length === 0 ? (
          <p className="py-6 text-sm text-ink-mute">No activity yet.</p>
        ) : (
          <ol className="space-y-3">
            {data.recentActivity.map((entry) => (
              <li key={entry.id} className="flex items-start gap-3 text-sm">
                <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pink" />
                <span className="min-w-0 flex-1">
                  <span className="text-ink-soft">{entry.summary ?? `${entry.entity} ${entry.action}`}</span>
                  <span className="ml-2 whitespace-nowrap text-xs text-ink-mute">
                    {entry.actorLabel ?? 'System'} · {formatDate(entry.createdAt)}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        )}
      </section>
    </>
  );
}

function DeadlineCell({
  label,
  date,
  days,
  note,
  bordered,
}: {
  label: string;
  date: string;
  days: number | null;
  note: string;
  bordered?: boolean;
}) {
  const passed = days !== null && days < 0;
  const urgent = days !== null && days >= 0 && days <= 60;

  return (
    <div className={`px-6 py-5 ${bordered ? 'border-t border-line sm:border-l sm:border-t-0' : ''}`}>
      <p className="eyebrow">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className="font-serif text-xl font-medium">{date}</span>
        <span
          className={`chip ${
            passed
              ? 'border-line bg-cream-deep text-ink-mute'
              : urgent
                ? 'border-pink-deep/30 bg-pink-wash text-pink-deep'
                : 'border-stage-emerald/25 bg-stage-emerald/10 text-stage-emerald'
          }`}
        >
          {passed ? 'Passed' : `${days} days left`}
        </span>
      </p>
      <p className="mt-2 text-sm text-ink-mute">{note}</p>
    </div>
  );
}
