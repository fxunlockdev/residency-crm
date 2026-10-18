import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { safeEqual } from '@/lib/client-ip';
import { isAdsConfigured } from '@/lib/google-ads';
import { AdsReportingError, fetchCampaignSpend } from '@/lib/google-ads-reporting';
import { todayUtc } from '@/lib/dates';

export const dynamic = 'force-dynamic';

/**
 * Pulls campaign spend into the CRM.
 *
 * Re-pulls a trailing window rather than only yesterday: Google restates recent
 * figures as invalid clicks are filtered out, so the last few days move after
 * the fact. Writes are upserts keyed on campaign and date, so running this
 * twice changes nothing.
 */
const DEFAULT_LOOKBACK_DAYS = 14;
const MAX_LOOKBACK_DAYS = 365;

async function pull(lookbackDays: number) {
  if (!isAdsConfigured()) {
    return NextResponse.json({ status: 'skipped', reason: 'Google Ads is not configured.' });
  }

  const to = todayUtc();
  const from = new Date(to.getTime() - lookbackDays * 86_400_000);

  let days;
  try {
    days = await fetchCampaignSpend(from, to);
  } catch (error) {
    const message = error instanceof AdsReportingError ? error.message : 'Google Ads reporting failed.';
    console.error('Ad spend pull failed:', message);
    return NextResponse.json({ status: 'error', reason: message }, { status: 502 });
  }

  const campaigns = new Map(days.map((day) => [day.campaignId, day]));
  for (const [id, day] of campaigns) {
    await prisma.adCampaign.upsert({
      where: { id },
      update: { name: day.campaignName, status: day.campaignStatus, lastSeenAt: new Date() },
      create: { id, name: day.campaignName, status: day.campaignStatus },
    });
  }

  for (const day of days) {
    await prisma.adSpendDaily.upsert({
      where: { campaignId_date: { campaignId: day.campaignId, date: day.date } },
      update: {
        costCents: day.costCents,
        clicks: day.clicks,
        impressions: day.impressions,
        currencyCode: day.currencyCode,
        fetchedAt: new Date(),
      },
      create: {
        campaignId: day.campaignId,
        date: day.date,
        costCents: day.costCents,
        clicks: day.clicks,
        impressions: day.impressions,
        currencyCode: day.currencyCode,
      },
    });
  }

  return NextResponse.json({
    status: 'ok',
    campaigns: campaigns.size,
    days: days.length,
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
  });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorised = secret ? safeEqual(request.headers.get('authorization'), `Bearer ${secret}`) : false;

  if (!authorised) {
    const user = await getCurrentUser();
    if (!user || !hasRole(user, 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  const requested = Number(request.nextUrl.searchParams.get('days') ?? DEFAULT_LOOKBACK_DAYS);
  const lookback = Number.isSafeInteger(requested)
    ? Math.min(MAX_LOOKBACK_DAYS, Math.max(1, requested))
    : DEFAULT_LOOKBACK_DAYS;

  return pull(lookback);
}

export async function POST(request: NextRequest) {
  return GET(request);
}
