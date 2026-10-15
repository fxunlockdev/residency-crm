import type { Metadata } from 'next';
import Link from 'next/link';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { PipelineBoard, type BoardCard } from '@/components/pipeline/board';

export const metadata: Metadata = { title: 'Pipeline board' };
export const dynamic = 'force-dynamic';

/** The board renders every card at once, so it is capped; the table view is unbounded. */
const BOARD_LIMIT = 300;

export default async function PipelinePage() {
  const user = await getCurrentUser();
  const [clients, total] = await Promise.all([
    prisma.client.findMany({
    take: BOARD_LIMIT,
    orderBy: [{ followUpDate: { sort: 'asc', nulls: 'last' } }, { fullName: 'asc' }],
    select: {
      id: true,
      reference: true,
      fullName: true,
      status: true,
      countryOfBirth: true,
      followUpDate: true,
      nextAction: true,
      project: { select: { name: true } },
      commissions: { select: { amountCents: true } },
    },
    }),
    prisma.client.count(),
  ]);

  const cards: BoardCard[] = clients.map((client) => ({
    id: client.id,
    reference: client.reference,
    fullName: client.fullName,
    status: client.status,
    countryOfBirth: client.countryOfBirth,
    projectName: client.project?.name ?? null,
    commissionCents: client.commissions.reduce((sum, c) => sum + c.amountCents, 0),
    followUpDate: client.followUpDate,
    nextAction: client.nextAction,
  }));

  return (
    <>
      <PageHeader
        eyebrow="Pipeline"
        title="Every case by stage"
        description="Drag a card to move it, or use the stage menu on the card. Moving a stage fills its date, releases any matching commission and records the change."
        actions={
          <Link href="/clients" className="btn-ghost">
            Table view
          </Link>
        }
      />
      {total > BOARD_LIMIT ? (
        <p className="mb-4 rounded-xl border border-line bg-cream-deep/50 px-4 py-3 text-sm text-ink-mute">
          Showing {BOARD_LIMIT} of {total} clients on the board.{' '}
          <Link href="/clients" className="link">
            Use the table view
          </Link>{' '}
          to see every record.
        </p>
      ) : null}
      <PipelineBoard cards={cards} canEdit={!!user && hasRole(user, 'ADVISOR')} />
    </>
  );
}
