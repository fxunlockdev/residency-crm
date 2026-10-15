import 'server-only';
import { prisma } from '@/lib/prisma';
import { FEE_INCREASE_DATE, INVESTMENT_INCREASE_DATE, todayUtc } from '@/lib/dates';
import { ACTIVE_STATUSES, PRE_FILING_STATUSES, STATUS_ORDER, WON_STATUSES } from '@/lib/pipeline';

export async function getDashboard() {
  const today = todayUtc();
  const endOfToday = new Date(today.getTime() + 86_400_000 - 1);

  const [
    statusGroups,
    activeClients,
    wonClients,
    commissionGroups,
    overdueCommissions,
    followUps,
    preFiling,
    recentActivity,
    investmentTotal,
  ] = await Promise.all([
    prisma.client.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.client.count({ where: { status: { in: ACTIVE_STATUSES } } }),
    prisma.client.count({ where: { status: { in: WON_STATUSES } } }),
    prisma.commission.groupBy({ by: ['status'], _count: { _all: true }, _sum: { amountCents: true } }),
    prisma.commission.findMany({
      where: { status: 'INVOICED', paymentDueDate: { lt: today } },
      select: { id: true, amountCents: true },
    }),
    prisma.client.findMany({
      where: { status: { in: ACTIVE_STATUSES }, followUpDate: { not: null, lte: endOfToday } },
      orderBy: [{ followUpDate: 'asc' }],
      take: 6,
      select: { id: true, reference: true, fullName: true, status: true, followUpDate: true, nextAction: true },
    }),
    prisma.client.findMany({
      where: { status: { in: PRE_FILING_STATUSES } },
      orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
      select: { id: true, reference: true, fullName: true, status: true, dateFunded: true, countryOfBirth: true },
    }),
    prisma.auditLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 8,
      select: { id: true, entity: true, entityId: true, action: true, summary: true, actorLabel: true, createdAt: true },
    }),
    prisma.client.aggregate({
      where: { status: { in: WON_STATUSES } },
      _sum: { investmentAmountCents: true },
    }),
  ]);

  const statusCounts = new Map(statusGroups.map((row) => [row.status, row._count._all]));
  const pipeline = STATUS_ORDER.map((status) => ({ status, count: statusCounts.get(status) ?? 0 }));

  const commissionByStatus = new Map(
    commissionGroups.map((row) => [row.status, { count: row._count._all, cents: row._sum.amountCents ?? 0 }]),
  );

  const overdueCents = overdueCommissions.reduce((sum, row) => sum + row.amountCents, 0);

  return {
    today,
    activeClients,
    wonClients,
    pipeline,
    commission: {
      due: commissionByStatus.get('DUE') ?? { count: 0, cents: 0 },
      invoiced: commissionByStatus.get('INVOICED') ?? { count: 0, cents: 0 },
      paid: commissionByStatus.get('PAID') ?? { count: 0, cents: 0 },
      notDue: commissionByStatus.get('NOT_DUE') ?? { count: 0, cents: 0 },
      disputed: commissionByStatus.get('DISPUTED') ?? { count: 0, cents: 0 },
      overdue: { count: overdueCommissions.length, cents: overdueCents },
    },
    followUps,
    deadlines: {
      feeIncrease: { date: FEE_INCREASE_DATE, atRisk: preFiling.length },
      investmentIncrease: { date: INVESTMENT_INCREASE_DATE, atRisk: preFiling.length },
      clients: preFiling.slice(0, 6),
    },
    recentActivity,
    investedCents: investmentTotal._sum.investmentAmountCents ?? 0,
  };
}
