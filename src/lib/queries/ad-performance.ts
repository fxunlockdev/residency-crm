import 'server-only';
import { prisma } from '@/lib/prisma';
import {
  costPer,
  isEngagedOrBeyond,
  isMaturing,
  isWon,
  monthKey,
  returnOnSpend,
} from '@/lib/ad-cohorts';

export type CampaignRow = {
  campaignId: string;
  campaignName: string;
  status: string | null;
  costCents: number;
  clicks: number;
  impressions: number;
  leads: number;
  engaged: number;
  funded: number;
  commissionCents: number;
  costPerLeadCents: number | null;
  costPerFundedCents: number | null;
  returnOnSpend: number | null;
};

export type CohortRow = {
  month: string;
  costCents: number;
  leads: number;
  engaged: number;
  funded: number;
  commissionCents: number;
  costPerLeadCents: number | null;
  costPerFundedCents: number | null;
  returnOnSpend: number | null;
  maturing: boolean;
};

export type AdPerformance = {
  configured: boolean;
  hasSpend: boolean;
  attributedLeads: number;
  totalLeads: number;
  currencyCode: string;
  currencyMismatch: boolean;
  totals: { costCents: number; leads: number; funded: number; commissionCents: number };
  campaigns: CampaignRow[];
  cohorts: CohortRow[];
  lastPulledAt: Date | null;
};

export async function getAdPerformance(): Promise<AdPerformance> {
  const [spend, campaigns, leads, totalLeads, latest] = await Promise.all([
    prisma.adSpendDaily.findMany({
      select: { campaignId: true, date: true, costCents: true, clicks: true, impressions: true, currencyCode: true },
    }),
    prisma.adCampaign.findMany({ select: { id: true, name: true, status: true } }),
    // Only leads we can actually attribute to a campaign belong in this view.
    prisma.client.findMany({
      where: { adCampaignId: { not: null } },
      select: {
        adCampaignId: true,
        status: true,
        leadDate: true,
        createdAt: true,
        commissions: { select: { amountCents: true } },
      },
    }),
    prisma.client.count(),
    prisma.adSpendDaily.findFirst({ orderBy: { fetchedAt: 'desc' }, select: { fetchedAt: true } }),
  ]);

  const campaignNames = new Map(campaigns.map((c) => [c.id, c]));
  const currencies = new Set(spend.map((row) => row.currencyCode));
  const currencyCode = currencies.values().next().value ?? 'USD';

  type Bucket = {
    costCents: number;
    clicks: number;
    impressions: number;
    leads: number;
    engaged: number;
    funded: number;
    commissionCents: number;
  };
  const blank = (): Bucket => ({
    costCents: 0,
    clicks: 0,
    impressions: 0,
    leads: 0,
    engaged: 0,
    funded: 0,
    commissionCents: 0,
  });

  const byCampaign = new Map<string, Bucket>();
  const byMonth = new Map<string, Bucket>();

  /** Get the bucket for a key, creating and storing it the first time. */
  const bucketFor = (map: Map<string, Bucket>, key: string): Bucket => {
    const existing = map.get(key);
    if (existing) return existing;
    const created = blank();
    map.set(key, created);
    return created;
  };

  for (const row of spend) {
    const campaign = bucketFor(byCampaign, row.campaignId);
    campaign.costCents += row.costCents;
    campaign.clicks += row.clicks;
    campaign.impressions += row.impressions;

    bucketFor(byMonth, monthKey(row.date)).costCents += row.costCents;
  }

  for (const lead of leads) {
    const commission = lead.commissions.reduce((sum, c) => sum + c.amountCents, 0);
    // Lead date is when the click happened; fall back to creation for records
    // captured before the form started recording it.
    const key = monthKey(lead.leadDate ?? lead.createdAt);
    const engaged = isEngagedOrBeyond(lead.status);
    const won = isWon(lead.status);

    for (const bucket of [bucketFor(byCampaign, lead.adCampaignId!), bucketFor(byMonth, key)]) {
      bucket.leads += 1;
      if (engaged) bucket.engaged += 1;
      if (won) {
        bucket.funded += 1;
        bucket.commissionCents += commission;
      }
    }
  }

  const campaignRows: CampaignRow[] = [...byCampaign.entries()]
    .map(([campaignId, bucket]) => ({
      campaignId,
      campaignName: campaignNames.get(campaignId)?.name ?? `Campaign ${campaignId}`,
      status: campaignNames.get(campaignId)?.status ?? null,
      ...bucket,
      costPerLeadCents: costPer(bucket.costCents, bucket.leads),
      costPerFundedCents: costPer(bucket.costCents, bucket.funded),
      returnOnSpend: returnOnSpend(bucket.commissionCents, bucket.costCents),
    }))
    .sort((a, b) => b.costCents - a.costCents);

  const cohortRows: CohortRow[] = [...byMonth.entries()]
    .map(([month, bucket]) => ({
      month,
      costCents: bucket.costCents,
      leads: bucket.leads,
      engaged: bucket.engaged,
      funded: bucket.funded,
      commissionCents: bucket.commissionCents,
      costPerLeadCents: costPer(bucket.costCents, bucket.leads),
      costPerFundedCents: costPer(bucket.costCents, bucket.funded),
      returnOnSpend: returnOnSpend(bucket.commissionCents, bucket.costCents),
      maturing: isMaturing(month),
    }))
    .sort((a, b) => b.month.localeCompare(a.month));

  return {
    configured: !!process.env.GOOGLE_ADS_DEVELOPER_TOKEN && !!process.env.GOOGLE_ADS_CUSTOMER_ID,
    hasSpend: spend.length > 0,
    attributedLeads: leads.length,
    totalLeads,
    currencyCode,
    currencyMismatch: currencyCode !== 'USD',
    totals: {
      costCents: campaignRows.reduce((sum, r) => sum + r.costCents, 0),
      leads: campaignRows.reduce((sum, r) => sum + r.leads, 0),
      funded: campaignRows.reduce((sum, r) => sum + r.funded, 0),
      commissionCents: campaignRows.reduce((sum, r) => sum + r.commissionCents, 0),
    },
    campaigns: campaignRows,
    cohorts: cohortRows,
    lastPulledAt: latest?.fetchedAt ?? null,
  };
}
