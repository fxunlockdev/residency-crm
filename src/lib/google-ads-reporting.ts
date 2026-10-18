import 'server-only';
import { getAdsConfig, getAdsAccessToken, GOOGLE_ADS_API_VERSION } from './google-ads';

/**
 * Reading spend out of Google Ads.
 *
 * The upload path pushes conversions; this pulls what each campaign cost, so
 * the CRM can put money spent next to investors won. Same credentials, read
 * scope only.
 */
export type CampaignDay = {
  campaignId: string;
  campaignName: string;
  campaignStatus: string | null;
  /** UTC midnight. */
  date: Date;
  costCents: number;
  clicks: number;
  impressions: number;
  currencyCode: string;
};

/** Google reports cost in micros: 1,000,000 micros is one unit of currency. */
export function microsToCents(micros: number | string | null | undefined): number {
  const value = typeof micros === 'string' ? Number(micros) : (micros ?? 0);
  if (!Number.isFinite(value)) return 0;
  return Math.round(value / 10_000);
}

/** yyyy-mm-dd in UTC, which is the format GAQL expects. */
export function toAdsDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

type SearchStreamRow = {
  campaign?: { id?: string | number; name?: string; status?: string };
  metrics?: { costMicros?: string | number; clicks?: string | number; impressions?: string | number };
  customer?: { currencyCode?: string };
  segments?: { date?: string };
};

/** Shapes the response rows, kept separate so it can be tested without a network call. */
export function parseCampaignDays(
  payload: Array<{ results?: SearchStreamRow[] }>,
  fallbackCurrency = 'USD',
): CampaignDay[] {
  const days: CampaignDay[] = [];

  for (const chunk of payload) {
    for (const row of chunk.results ?? []) {
      const id = row.campaign?.id;
      const date = row.segments?.date;
      if (id === undefined || id === null || !date) continue;

      days.push({
        campaignId: String(id),
        campaignName: row.campaign?.name ?? `Campaign ${id}`,
        campaignStatus: row.campaign?.status ?? null,
        date: new Date(`${date}T00:00:00.000Z`),
        costCents: microsToCents(row.metrics?.costMicros),
        clicks: Number(row.metrics?.clicks ?? 0) || 0,
        impressions: Number(row.metrics?.impressions ?? 0) || 0,
        currencyCode: row.customer?.currencyCode ?? fallbackCurrency,
      });
    }
  }

  return days;
}

export function buildCampaignQuery(from: Date, to: Date): string {
  // Removed campaigns are excluded: their spend is already counted in the days
  // they ran, and listing them clutters the dashboard forever.
  return `
    SELECT
      campaign.id,
      campaign.name,
      campaign.status,
      customer.currency_code,
      segments.date,
      metrics.cost_micros,
      metrics.clicks,
      metrics.impressions
    FROM campaign
    WHERE segments.date BETWEEN '${toAdsDate(from)}' AND '${toAdsDate(to)}'
      AND campaign.status != 'REMOVED'
  `.trim();
}

export class AdsReportingError extends Error {}

/** Fetches per-campaign, per-day spend for the window. */
export async function fetchCampaignSpend(from: Date, to: Date): Promise<CampaignDay[]> {
  const config = getAdsConfig();
  if (!config) throw new AdsReportingError('Google Ads is not configured.');

  const accessToken = await getAdsAccessToken(config);

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': config.developerToken,
    'Content-Type': 'application/json',
  };
  if (config.loginCustomerId) headers['login-customer-id'] = config.loginCustomerId;

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${config.customerId}/googleAds:searchStream`,
    {
      method: 'POST',
      headers,
      body: JSON.stringify({ query: buildCampaignQuery(from, to) }),
      signal: AbortSignal.timeout(60_000),
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new AdsReportingError(`Google Ads reporting failed (${response.status}): ${text.slice(0, 300)}`);
  }

  const body = (await response.json()) as Array<{ results?: SearchStreamRow[] }> | { results?: SearchStreamRow[] };
  // searchStream returns an array of chunks; a single-chunk response is sometimes
  // delivered as a bare object.
  return parseCampaignDays(Array.isArray(body) ? body : [body]);
}
