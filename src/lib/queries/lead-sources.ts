import 'server-only';
import type { LeadSource } from '@prisma/client';
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

export async function getLeadSourceBreakdown() {
  const clients = await prisma.client.findMany({
    select: {
      source: true,
      status: true,
      utmCampaign: true,
      keyword: true,
      gclid: true,
      commissions: { select: { amountCents: true } },
    },
  });

  const bySource = new Map<LeadSource, SourceRow>();
  const byCampaign = new Map<string, SourceRow>();

  for (const client of clients) {
    const won = WON_STATUSES.includes(client.status);
    const lost = client.status === 'LOST';
    const commissionCents = client.commissions.reduce((sum, c) => sum + c.amountCents, 0);

    const sourceRow = bySource.get(client.source) ?? {
      key: client.source,
      label: client.source,
      total: 0,
      funded: 0,
      lost: 0,
      commissionCents: 0,
      fundedRate: 0,
    };
    sourceRow.total += 1;
    if (won) sourceRow.funded += 1;
    if (lost) sourceRow.lost += 1;
    sourceRow.commissionCents += commissionCents;
    bySource.set(client.source, sourceRow);

    if (client.source === 'GOOGLE_ADS' || client.utmCampaign) {
      const key = client.utmCampaign ?? 'Campaign not recorded';
      const campaignRow = byCampaign.get(key) ?? {
        key,
        label: key,
        total: 0,
        funded: 0,
        lost: 0,
        commissionCents: 0,
        fundedRate: 0,
      };
      campaignRow.total += 1;
      if (won) campaignRow.funded += 1;
      if (lost) campaignRow.lost += 1;
      campaignRow.commissionCents += commissionCents;
      byCampaign.set(key, campaignRow);
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
    withGclid: clients.filter((c) => !!c.gclid).length,
    total: clients.length,
  };
}
