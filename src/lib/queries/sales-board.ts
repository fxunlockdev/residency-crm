import 'server-only';
import type { ClientStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { SALES_STAGES } from '@/lib/pipeline';

/** Commission statuses that still represent money not yet in the bank. */
const UNEARNED = ['NOT_DUE', 'DUE', 'INVOICED', 'DISPUTED'] as const;

export type SalesCard = {
  id: string;
  reference: string;
  fullName: string;
  status: ClientStatus;
  phone: string | null;
  countryOfBirth: string | null;
  attorney: string | null;
  /** What this deal is worth to us: real unpaid commission, else the estimate. */
  potentialRevenueCents: number;
  /** True when the figure is an estimate rather than a recorded commission. */
  isEstimate: boolean;
  followUpDate: Date | null;
  nextAction: string | null;
};

export type SalesBoard = {
  cards: SalesCard[];
  /** Unearned commission on deals still in the sales pipeline. */
  pipelineCommissionCents: number;
  /** Deals on the board that carry no revenue figure yet. */
  withoutValue: number;
  /**
   * Filed cases excluded from the board because no commission was ever
   * recorded against them. They are a data gap, not live sales.
   */
  filedWithoutCommission: number;
  /**
   * Unearned commission on cases that have moved past the sales board. It is
   * still owed, so it is surfaced rather than quietly dropped from the total.
   */
  beyondBoardCents: number;
  beyondBoardCount: number;
};

export async function getSalesBoard(): Promise<SalesBoard> {
  const [clients, beyond] = await Promise.all([
    prisma.client.findMany({
      where: { status: { in: SALES_STAGES } },
      orderBy: [{ followUpDate: { sort: 'asc', nulls: 'last' } }, { fullName: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        reference: true,
        fullName: true,
        status: true,
        phone: true,
        countryOfBirth: true,
        attorney: true,
        followUpDate: true,
        nextAction: true,
        expectedCommissionCents: true,
        commissions: { select: { amountCents: true, status: true } },
      },
    }),
    prisma.commission.findMany({
      where: { status: { in: [...UNEARNED] }, client: { status: { notIn: [...SALES_STAGES, 'LOST'] } } },
      select: { amountCents: true },
    }),
  ]);

  const cards: SalesCard[] = [];
  let pipelineCommissionCents = 0;
  let withoutValue = 0;
  let filedWithoutCommission = 0;

  for (const client of clients) {
    const unpaid = client.commissions
      .filter((c) => c.status !== 'PAID')
      .reduce((sum, c) => sum + c.amountCents, 0);
    const hasAnyCommission = client.commissions.length > 0;

    // A deal whose commission is fully paid is revenue, not pipeline, so it
    // leaves the board.
    if (hasAnyCommission && unpaid === 0) continue;

    const potentialRevenueCents = unpaid > 0 ? unpaid : (client.expectedCommissionCents ?? 0);

    // A case filed years ago with no commission ever recorded is a gap in the
    // data, not a live deal. Keeping it here would refill the board with the
    // history this view exists to get away from. The early stages always show,
    // because work is obviously in progress there whatever the money says.
    if (client.status === 'I526E_FILED' && potentialRevenueCents === 0) {
      filedWithoutCommission += 1;
      continue;
    }

    pipelineCommissionCents += potentialRevenueCents;
    if (potentialRevenueCents === 0) withoutValue += 1;

    cards.push({
      id: client.id,
      reference: client.reference,
      fullName: client.fullName,
      status: client.status,
      phone: client.phone,
      countryOfBirth: client.countryOfBirth,
      attorney: client.attorney,
      potentialRevenueCents,
      isEstimate: unpaid === 0,
      followUpDate: client.followUpDate,
      nextAction: client.nextAction,
    });
  }

  return {
    cards,
    pipelineCommissionCents,
    withoutValue,
    filedWithoutCommission,
    beyondBoardCents: beyond.reduce((sum, c) => sum + c.amountCents, 0),
    beyondBoardCount: beyond.length,
  };
}
