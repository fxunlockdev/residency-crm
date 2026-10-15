import 'server-only';
import type { ConversionType } from '@prisma/client';

/**
 * Google Ads offline conversion upload.
 *
 * The CRM always records conversion events. This module only uploads them, and stays
 * dormant until the credentials are configured — so nothing breaks before Google Ads
 * is connected, and nothing is lost in the meantime.
 */

const GOOGLE_ADS_API_VERSION = 'v18';

/** Google rejects clicks older than 90 days, so the queue stops trying beyond that. */
export const MAX_CLICK_AGE_DAYS = 90;

export type AdsConfig = {
  customerId: string;
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  loginCustomerId?: string;
  conversionActions: Record<ConversionType, string | undefined>;
};

export function getAdsConfig(): AdsConfig | null {
  const customerId = (process.env.GOOGLE_ADS_CUSTOMER_ID ?? '').replace(/-/g, '').trim();
  const developerToken = process.env.GOOGLE_ADS_DEVELOPER_TOKEN?.trim();
  const clientId = process.env.GOOGLE_ADS_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_ADS_CLIENT_SECRET?.trim();
  const refreshToken = process.env.GOOGLE_ADS_REFRESH_TOKEN?.trim();

  if (!customerId || !developerToken || !clientId || !clientSecret || !refreshToken) return null;

  return {
    customerId,
    developerToken,
    clientId,
    clientSecret,
    refreshToken,
    loginCustomerId: (process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID ?? '').replace(/-/g, '').trim() || undefined,
    conversionActions: {
      LEAD: process.env.GOOGLE_ADS_CONVERSION_LEAD?.trim(),
      ENGAGED: process.env.GOOGLE_ADS_CONVERSION_ENGAGED?.trim(),
      FUNDED: process.env.GOOGLE_ADS_CONVERSION_FUNDED?.trim(),
    },
  };
}

export function isAdsConfigured(): boolean {
  return getAdsConfig() !== null;
}

async function getAccessToken(config: AdsConfig): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  if (!response.ok) {
    throw new Error(`Google OAuth refresh failed (${response.status})`);
  }

  const body = (await response.json()) as { access_token?: string };
  if (!body.access_token) throw new Error('Google OAuth response contained no access token.');
  return body.access_token;
}

export type PendingConversion = {
  id: string;
  type: ConversionType;
  gclid: string;
  occurredAt: Date;
  valueCents: number | null;
};

export type UploadOutcome = { id: string; status: 'SENT' | 'FAILED' | 'SKIPPED'; error?: string };

/** Google expects "yyyy-mm-dd hh:mm:ss+00:00". */
export function formatConversionTime(date: Date): string {
  return `${date.toISOString().slice(0, 19).replace('T', ' ')}+00:00`;
}

export function isWithinClickWindow(occurredAt: Date, now = new Date()): boolean {
  const ageDays = (now.getTime() - occurredAt.getTime()) / 86_400_000;
  return ageDays <= MAX_CLICK_AGE_DAYS;
}

export async function uploadConversions(events: PendingConversion[]): Promise<UploadOutcome[]> {
  const config = getAdsConfig();
  if (!config) {
    return events.map((event) => ({ id: event.id, status: 'SKIPPED', error: 'Google Ads is not configured.' }));
  }

  const outcomes: UploadOutcome[] = [];
  const uploadable: PendingConversion[] = [];

  for (const event of events) {
    const action = config.conversionActions[event.type];
    if (!action) {
      outcomes.push({ id: event.id, status: 'SKIPPED', error: `No conversion action configured for ${event.type}.` });
      continue;
    }
    if (!isWithinClickWindow(event.occurredAt)) {
      outcomes.push({
        id: event.id,
        status: 'SKIPPED',
        error: `Click is older than ${MAX_CLICK_AGE_DAYS} days; Google will not accept it.`,
      });
      continue;
    }
    uploadable.push(event);
  }

  if (uploadable.length === 0) return outcomes;

  let accessToken: string;
  try {
    accessToken = await getAccessToken(config);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'OAuth failed.';
    return outcomes.concat(uploadable.map((event) => ({ id: event.id, status: 'FAILED', error: message })));
  }

  const headers: Record<string, string> = {
    Authorization: `Bearer ${accessToken}`,
    'developer-token': config.developerToken,
    'Content-Type': 'application/json',
  };
  if (config.loginCustomerId) headers['login-customer-id'] = config.loginCustomerId;

  const body = {
    conversions: uploadable.map((event) => ({
      gclid: event.gclid,
      conversionAction: `customers/${config.customerId}/conversionActions/${config.conversionActions[event.type]}`,
      conversionDateTime: formatConversionTime(event.occurredAt),
      ...(event.valueCents
        ? { conversionValue: event.valueCents / 100, currencyCode: 'USD' }
        : {}),
    })),
    partialFailure: true,
  };

  const response = await fetch(
    `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/${config.customerId}:uploadClickConversions`,
    { method: 'POST', headers, body: JSON.stringify(body) },
  );

  if (!response.ok) {
    const text = await response.text();
    const message = `Google Ads upload failed (${response.status}): ${text.slice(0, 300)}`;
    return outcomes.concat(uploadable.map((event) => ({ id: event.id, status: 'FAILED', error: message })));
  }

  const result = (await response.json()) as {
    partialFailureError?: { message?: string };
    results?: Array<Record<string, unknown>>;
  };

  // With partialFailure the response keeps positional results; an empty slot means that row failed.
  return outcomes.concat(
    uploadable.map((event, index) => {
      const row = result.results?.[index];
      if (row && Object.keys(row).length > 0) return { id: event.id, status: 'SENT' as const };
      return {
        id: event.id,
        status: 'FAILED' as const,
        error: result.partialFailureError?.message ?? 'Google Ads rejected this conversion.',
      };
    }),
  );
}
