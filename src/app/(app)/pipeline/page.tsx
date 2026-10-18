import Link from 'next/link';
import type { Metadata } from 'next';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { getSalesBoard } from '@/lib/queries/sales-board';
import { PageHeader } from '@/components/ui/page-header';
import { Metric } from '@/components/ui/metric';
import { SalesBoard } from '@/components/sales/sales-board';
import { AddProspect } from '@/components/sales/add-prospect';
import { formatCents } from '@/lib/money';

export const metadata: Metadata = { title: 'Sales pipeline' };
export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const user = await getCurrentUser();
  const board = await getSalesBoard();
  const canEdit = !!user && hasRole(user, 'ADVISOR');

  const won = board.cards.filter((card) => card.status === 'I526E_FILED').length;

  return (
    <>
      <PageHeader
        eyebrow="Sales"
        title="What is in play"
        description="Deals still being won, and the commission they would generate. A case leaves the board once its commission is paid — that is revenue, not pipeline."
        actions={
          <Link href="/clients" className="btn-ghost">
            All clients
          </Link>
        }
      />

      <section aria-label="Pipeline value" className="mb-8 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <Metric
          label="Pipeline commission"
          value={formatCents(board.pipelineCommissionCents)}
          sub={
            board.withoutValue > 0
              ? `${board.cards.length} open deals · ${board.withoutValue} with no value set`
              : `across ${board.cards.length} open deal${board.cards.length === 1 ? '' : 's'}`
          }
          tone={board.pipelineCommissionCents > 0 ? 'accent' : 'default'}
        />
        <Metric
          label="At I-526E filed"
          value={String(won)}
          sub="closest to paying out"
        />
        {board.beyondBoardCents > 0 ? (
          <Metric
            label="Owed beyond the board"
            value={formatCents(board.beyondBoardCents)}
            sub={`${board.beyondBoardCount} commission${board.beyondBoardCount === 1 ? '' : 's'} on cases past filing`}
            href="/commissions"
          />
        ) : null}
      </section>

      {canEdit ? (
        <div className="mb-6">
          <AddProspect />
        </div>
      ) : null}

      <SalesBoard cards={board.cards} canEdit={canEdit} />

      {board.cards.length === 0 ? (
        <p className="mt-6 max-w-xl text-sm text-ink-mute">
          Nothing in play yet. Every migrated case has either been paid or moved past filing, so the board starts
          empty — add a prospect above and it will fill up as you work.
        </p>
      ) : null}

      {board.filedWithoutCommission > 0 ? (
        <p className="mt-6 max-w-2xl text-sm text-ink-mute">
          {board.filedWithoutCommission} filed case{board.filedWithoutCommission === 1 ? ' is' : 's are'} kept off the
          board because no commission was ever recorded against{' '}
          {board.filedWithoutCommission === 1 ? 'it' : 'them'} — a gap in the migrated data rather than live sales. They
          are listed under{' '}
          <Link href="/settings" className="link">
            data quality
          </Link>
          .
        </p>
      ) : null}
    </>
  );
}
