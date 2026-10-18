import { describe, expect, it } from 'vitest';
import { buildCampaignQuery, microsToCents, parseCampaignDays, toAdsDate } from '@/lib/google-ads-reporting';

describe('microsToCents', () => {
  it('converts Google micros to the integer cents used everywhere else', () => {
    // 1,000,000 micros is one unit of currency, so £12.34 arrives as 12,340,000.
    expect(microsToCents(12_340_000)).toBe(1234);
    expect(microsToCents('12340000')).toBe(1234);
    expect(microsToCents(0)).toBe(0);
  });

  it('rounds sub-cent amounts rather than truncating', () => {
    expect(microsToCents(15_000)).toBe(2);
    expect(microsToCents(14_000)).toBe(1);
  });

  it('treats missing or unparseable cost as zero', () => {
    expect(microsToCents(null)).toBe(0);
    expect(microsToCents(undefined)).toBe(0);
    expect(microsToCents('not a number')).toBe(0);
  });
});

describe('toAdsDate', () => {
  it('formats in UTC, as GAQL expects', () => {
    expect(toAdsDate(new Date('2026-03-09T23:40:00.000Z'))).toBe('2026-03-09');
  });
});

describe('buildCampaignQuery', () => {
  const query = buildCampaignQuery(new Date('2026-03-01T00:00:00Z'), new Date('2026-03-31T00:00:00Z'));

  it('asks for what the dashboard needs', () => {
    for (const field of [
      'campaign.id',
      'campaign.name',
      'customer.currency_code',
      'segments.date',
      'metrics.cost_micros',
      'metrics.clicks',
    ]) {
      expect(query).toContain(field);
    }
  });

  it('bounds the window and leaves out removed campaigns', () => {
    expect(query).toContain("BETWEEN '2026-03-01' AND '2026-03-31'");
    expect(query).toContain("campaign.status != 'REMOVED'");
  });
});

describe('parseCampaignDays', () => {
  const payload = [
    {
      results: [
        {
          campaign: { id: 123, name: 'EB-5 UK Brand', status: 'ENABLED' },
          metrics: { costMicros: '45670000', clicks: '12', impressions: '340' },
          customer: { currencyCode: 'GBP' },
          segments: { date: '2026-03-09' },
        },
      ],
    },
  ];

  it('shapes a row into a day of spend', () => {
    const [day] = parseCampaignDays(payload);
    expect(day).toMatchObject({
      campaignId: '123',
      campaignName: 'EB-5 UK Brand',
      costCents: 4567,
      clicks: 12,
      impressions: 340,
      currencyCode: 'GBP',
    });
    expect(day!.date.toISOString()).toBe('2026-03-09T00:00:00.000Z');
  });

  it('reads the campaign id as a string whether Google sends a number or a string', () => {
    const asString = parseCampaignDays([{ results: [{ ...payload[0]!.results![0]!, campaign: { id: '123' } }] }]);
    expect(asString[0]!.campaignId).toBe('123');
  });

  it('skips rows with no campaign or no date rather than inventing one', () => {
    const rows = parseCampaignDays([
      { results: [{ metrics: { costMicros: '1000000' }, segments: { date: '2026-03-09' } }] },
      { results: [{ campaign: { id: 7 }, metrics: { costMicros: '1000000' } }] },
    ]);
    expect(rows).toEqual([]);
  });

  it('handles an empty or chunked response', () => {
    expect(parseCampaignDays([])).toEqual([]);
    expect(parseCampaignDays([{}])).toEqual([]);
    expect(parseCampaignDays([{ results: [] }, payload[0]!])).toHaveLength(1);
  });

  it('falls back to a currency rather than leaving it blank', () => {
    const rows = parseCampaignDays([
      { results: [{ campaign: { id: 1 }, segments: { date: '2026-03-09' }, metrics: {} }] },
    ]);
    expect(rows[0]!.currencyCode).toBe('USD');
    expect(rows[0]!.costCents).toBe(0);
  });
});
