import 'server-only';
import { prisma } from '@/lib/prisma';
import { todayUtc } from '@/lib/dates';
import { ACTIVE_STATUSES } from '@/lib/pipeline';

/** Counts used for the navigation badges — one round trip, cached per request. */
export async function getNavCounts() {
  const today = todayUtc();
  const endOfToday = new Date(today.getTime() + 86_400_000 - 1);

  const [followUps, commissionsNeedingAction, activeClients, updateSubscribers] = await Promise.all([
    prisma.client.count({
      where: { status: { in: ACTIVE_STATUSES }, followUpDate: { not: null, lte: endOfToday } },
    }),
    prisma.commission.count({
      where: {
        // A client who is not proceeding is not money to chase.
        client: { status: { not: 'LOST' } },
        OR: [{ status: 'DUE' }, { status: 'INVOICED', paymentDueDate: { lt: today } }],
      },
    }),
    prisma.client.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    prisma.updateSubscription.count({ where: { unsubscribedAt: null } }),
  ]);

  return { followUps, commissionsNeedingAction, activeClients, updateSubscribers };
}
