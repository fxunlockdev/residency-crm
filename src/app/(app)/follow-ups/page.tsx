import Link from 'next/link';
import type { Metadata } from 'next';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui/page-header';
import { StatusChip } from '@/components/ui/chips';
import { EmptyState } from '@/components/ui/empty-state';
import { ACTIVE_STATUSES } from '@/lib/pipeline';
import { daysUntil, formatDate, relativeDays, todayUtc } from '@/lib/dates';

export const metadata: Metadata = { title: 'Follow-ups' };
export const dynamic = 'force-dynamic';

export default async function FollowUpsPage() {
  const today = todayUtc();
  const endOfToday = new Date(today.getTime() + 86_400_000 - 1);
  const horizon = new Date(today.getTime() + 14 * 86_400_000);

  const clients = await prisma.client.findMany({
    where: { status: { in: ACTIVE_STATUSES }, followUpDate: { not: null, lte: horizon } },
    orderBy: [{ followUpDate: 'asc' }],
    select: {
      id: true,
      reference: true,
      fullName: true,
      status: true,
      followUpDate: true,
      nextAction: true,
      phone: true,
      email: true,
      owner: { select: { name: true } },
    },
  });

  const overdue = clients.filter((c) => c.followUpDate! < today);
  const dueToday = clients.filter((c) => c.followUpDate! >= today && c.followUpDate! <= endOfToday);
  const upcoming = clients.filter((c) => c.followUpDate! > endOfToday);

  return (
    <>
      <PageHeader
        eyebrow="Work queue"
        title="Follow-ups"
        description="Anything due today or already overdue, plus the next fortnight. Lost records are excluded."
      />

      {clients.length === 0 ? (
        <EmptyState
          title="Nothing to chase"
          description="Set a follow-up date on a client and it will appear here on the day."
          action={
            <Link href="/clients" className="btn-ghost">
              Browse clients
            </Link>
          }
        />
      ) : (
        <div className="space-y-8">
          <Group title="Overdue" tone="alert" clients={overdue} />
          <Group title="Due today" tone="accent" clients={dueToday} />
          <Group title="Next 14 days" clients={upcoming} />
        </div>
      )}
    </>
  );
}

type Row = {
  id: string;
  reference: string;
  fullName: string;
  status: 'PROSPECT' | 'ENGAGED' | 'FUNDED' | 'I526E_FILED' | 'I526E_APPROVED' | 'GREEN_CARD_CONDITIONAL' | 'I829_FILED' | 'I829_APPROVED' | 'LOST';
  followUpDate: Date | null;
  nextAction: string | null;
  phone: string | null;
  email: string | null;
  owner: { name: string } | null;
};

function Group({ title, clients, tone }: { title: string; clients: Row[]; tone?: 'alert' | 'accent' }) {
  if (clients.length === 0) return null;

  return (
    <section aria-labelledby={`group-${title}`}>
      <h2
        id={`group-${title}`}
        className="h-section mb-3 flex items-center gap-3"
      >
        {title}
        <span
          className={`chip ${
            tone === 'alert'
              ? 'border-stage-rose/30 bg-stage-rose/10 text-stage-rose'
              : tone === 'accent'
                ? 'border-pink/35 bg-pink-wash text-pink-deep'
                : 'border-line bg-cream-deep text-ink-mute'
          }`}
        >
          {clients.length}
        </span>
      </h2>

      <div className="surface overflow-hidden">
        <ul className="divide-y divide-line">
          {clients.map((client) => (
            <li key={client.id}>
              <Link
                href={`/clients/${client.id}`}
                className="flex flex-wrap items-center justify-between gap-4 px-5 py-4 transition-colors duration-200 hover:bg-pink-wash/50"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-ink">{client.fullName}</span>
                    <StatusChip status={client.status} />
                  </span>
                  <span className="mt-1 block text-sm text-ink-mute">
                    {client.nextAction ?? 'No next action recorded'}
                  </span>
                </span>
                <span className="shrink-0 text-right text-sm">
                  <span
                    className={`block font-medium tabular ${
                      (daysUntil(client.followUpDate) ?? 1) <= 0 ? 'text-pink-deep' : 'text-ink'
                    }`}
                  >
                    {formatDate(client.followUpDate)}
                  </span>
                  <span className="block text-xs text-ink-mute">{relativeDays(client.followUpDate)}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
