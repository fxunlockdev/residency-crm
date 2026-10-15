import 'server-only';
import { prisma } from '@/lib/prisma';
import { WON_STATUSES } from '@/lib/pipeline';

export type SourceRow = {
  key: string;
  label: string;
  total: number;
  funded: number;
  lost: number;
  commissionCents: number;
  fundedRate: number;
};

function rate(funded: number, total: number): number {
  return total === 0 ? 0 : Math.round((funded / total) * 1000) / 10;
}

/**
 * Aggregated in Postgres rather than by loading every client and every
 * commission into the process — this page would otherwise be the first thing
 * to exhaust memory as the book grows.
 */
export async function getLeadSourceBreakdown() {
  const [sourceRows, campaignRows, commissionRows, gclidCount, total] = await Promise.all([
    prisma.client.groupBy({ by: ['source', 'status'], _count: { _all: true } }),
    prisma.client.groupBy({ by: ['utmCampaign', 'status'], where: { utmCampaign: { not: null } }, _count: { _all: true } }),
    prisma.$queryRaw<Array<{ source: string; campaign: string | null; cents: bigint }>>`
      SELECT c."source"::text AS source, c."utmCampaign" AS campaign, COALESCE(SUM(m."amountCents"), 0)::bigint AS cents
      FROM "Client" c LEFT JOIN "Commission" m ON m."clientId" = c."id"
      GROUP BY c."source", c."utmCampaign"
    `,
    prisma.client.count({ where: { gclid: { not: null } } }),
    prisma.client.count(),
  ]);

  const blank = (key: string): SourceRow => ({
    key,
    label: key,
    total: 0,
    funded: 0,
    lost: 0,
    commissionCents: 0,
    fundedRate: 0,
  });

  const bySource = new Map<string, SourceRow>();
  for (const row of sourceRows) {
    const entry = bySource.get(row.source) ?? blank(row.source);
    entry.total += row._count._all;
    if (WON_STATUSES.includes(row.status)) entry.funded += row._count._all;
    if (row.status === 'LOST') entry.lost += row._count._all;
    bySource.set(row.source, entry);
  }

  const byCampaign = new Map<string, SourceRow>();
  for (const row of campaignRows) {
    const key = row.utmCampaign ?? 'Campaign not recorded';
    const entry = byCampaign.get(key) ?? blank(key);
    entry.total += row._count._all;
    if (WON_STATUSES.includes(row.status)) entry.funded += row._count._all;
    if (row.status === 'LOST') entry.lost += row._count._all;
    byCampaign.set(key, entry);
  }

  for (const row of commissionRows) {
    const cents = Number(row.cents);
    const sourceEntry = bySource.get(row.source);
    if (sourceEntry) sourceEntry.commissionCents += cents;
    if (row.campaign) {
      const campaignEntry = byCampaign.get(row.campaign);
      if (campaignEntry) campaignEntry.commissionCents += cents;
    }
  }

  const finish = (rows: SourceRow[]) =>
    rows
      .map((row) => ({ ...row, fundedRate: rate(row.funded, row.total) }))
      .sort((a, b) => b.total - a.total);

  const conversions = await prisma.conversionEvent.groupBy({
    by: ['type', 'status'],
    _count: { _all: true },
  });

  return {
    sources: finish([...bySource.values()]),
    campaigns: finish([...byCampaign.values()]),
    conversions,
    withGclid: gclidCount,
    total,
  };
}
