import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/leads/intake/route';

/**
 * The only unauthenticated, internet-facing write path in the app. Five
 * protections run inside this one function — shared token, rate limit,
 * honeypot, schema validation and the CORS allowlist — and a mocked database
 * would not prove that a rejected request writes nothing, so this runs against
 * a real Postgres.
 */
const TOKEN = 'integration-test-token';
const EMAIL = 'intake.probe@example.test';

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('https://crm.test/api/leads/intake', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }) as never,
  );
}

const authed = (extra: Record<string, string> = {}) => ({
  'x-rf-token': TOKEN,
  // A distinct address per test keeps the per-IP bucket out of the way.
  'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 250) + 1}`,
  ...extra,
});

const LEAD = { fullName: 'intake probe', email: EMAIL };

async function cleanUp() {
  await prisma.client.deleteMany({ where: { email: { endsWith: '@example.test' } } });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'lead:' } } });
}

beforeAll(() => {
  process.env.LEAD_INTAKE_TOKEN = TOKEN;
});

beforeEach(cleanUp);
afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

describe('POST /api/leads/intake — authentication', () => {
  it('refuses a request with no token and writes nothing', async () => {
    const response = await post(LEAD, { 'x-forwarded-for': '203.0.113.9' });
    expect(response.status).toBe(401);
    expect(await prisma.client.count({ where: { email: EMAIL } })).toBe(0);
  });

  it('refuses a wrong token', async () => {
    const response = await post(LEAD, authed({ 'x-rf-token': 'not-the-token' }));
    expect(response.status).toBe(401);
    expect(await prisma.client.count({ where: { email: EMAIL } })).toBe(0);
  });

  it('closes the endpoint entirely when no token is configured', async () => {
    // Fail closed: an unset variable must not mean "accept anyone".
    const saved = process.env.LEAD_INTAKE_TOKEN;
    process.env.LEAD_INTAKE_TOKEN = '';
    try {
      const response = await post(LEAD, authed());
      expect(response.status).toBe(503);
      expect(await prisma.client.count({ where: { email: EMAIL } })).toBe(0);
    } finally {
      process.env.LEAD_INTAKE_TOKEN = saved;
    }
  });
});

describe('POST /api/leads/intake — validation and spam', () => {
  it('accepts a honeypot submission but records nothing', async () => {
    // Silently 202 so a bot cannot tell it was detected.
    const response = await post({ ...LEAD, company_website: 'http://spam.example' }, authed());
    expect(response.status).toBe(202);
    expect(await prisma.client.count({ where: { email: EMAIL } })).toBe(0);
  });

  it('rejects an invalid payload without touching the database', async () => {
    const response = await post({ fullName: 'A' }, authed());
    expect(response.status).toBe(422);
    expect(await prisma.client.count()).toBeGreaterThanOrEqual(0);
  });

  it('rejects a body that is not JSON', async () => {
    const response = await POST(
      new Request('https://crm.test/api/leads/intake', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authed() },
        body: 'not json',
      }) as never,
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /api/leads/intake — the happy path', () => {
  it('creates a prospect, normalises the input and queues the conversion', async () => {
    const response = await post(
      {
        fullName: '  mixed CASE name ',
        email: '  Intake.Probe@Example.TEST ',
        phone: '+44 7700 900123',
        countryOfBirth: 'UK',
        gclid: 'Cj0KCQ-test',
        utmCampaign: 'eb5-brand',
        marketingConsent: true,
      },
      authed(),
    );

    expect(response.status).toBe(201);
    // The sequential reference would leak the size of the book.
    expect(await response.json()).toEqual({ ok: true });

    const client = await prisma.client.findFirstOrThrow({ where: { email: EMAIL } });
    expect(client.fullName).toBe('Mixed Case Name');
    expect(client.countryOfBirth).toBe('United Kingdom');
    expect(client.status).toBe('PROSPECT');
    // A click id means the lead came from Google Ads, whatever the form said.
    expect(client.source).toBe('GOOGLE_ADS');
    expect(client.marketingConsent).toBe(true);

    const conversion = await prisma.conversionEvent.findFirstOrThrow({ where: { clientId: client.id } });
    expect(conversion.type).toBe('LEAD');
    expect(conversion.status).toBe('PENDING');
  });

  it('skips the conversion upload when there is no click id', async () => {
    await post(LEAD, authed());
    const client = await prisma.client.findFirstOrThrow({ where: { email: EMAIL } });
    const conversion = await prisma.conversionEvent.findFirstOrThrow({ where: { clientId: client.id } });
    expect(conversion.status).toBe('SKIPPED');
    expect(client.source).toBe('WEBSITE');
  });

  it('merges a repeat enquiry instead of creating a second record', async () => {
    await post({ ...LEAD, gclid: 'first-click', message: 'First' }, authed());
    const second = await post(
      { ...LEAD, message: 'Second', utmCampaign: 'retarget', marketingConsent: true },
      authed(),
    );

    expect(second.status).toBe(200);
    const clients = await prisma.client.findMany({ where: { email: EMAIL } });
    expect(clients).toHaveLength(1);

    const [client] = clients;
    expect(client!.gclid).toBe('first-click'); // earlier attribution survives
    expect(client!.utmCampaign).toBe('retarget'); // later campaign applied
    expect(client!.marketingConsent).toBe(true); // consent only ever turns on
    expect(client!.notes).toContain('First');
    expect(client!.notes).toContain('Second');
  });
});

describe('POST /api/leads/intake — rate limiting', () => {
  it('blocks a flood from one address after the limit', async () => {
    const headers = authed({ 'x-forwarded-for': '198.51.100.77' });
    for (let i = 0; i < 10; i += 1) {
      await post({ fullName: `Flood ${i}`, email: `flood${i}@example.test` }, headers);
    }

    const blocked = await post({ fullName: 'Flood 11', email: 'flood11@example.test' }, headers);
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
  });

  it('counts the proxy-appended address, not one the caller prepended', async () => {
    // An attacker rotating the left-most entry must still hit the same bucket.
    for (let i = 0; i < 10; i += 1) {
      await post(
        { fullName: `Spoof ${i}`, email: `spoof${i}@example.test` },
        authed({ 'x-forwarded-for': `10.0.0.${i}, 198.51.100.88` }),
      );
    }

    const blocked = await post(
      { fullName: 'Spoof 11', email: 'spoof11@example.test' },
      authed({ 'x-forwarded-for': '10.0.0.99, 198.51.100.88' }),
    );
    expect(blocked.status).toBe(429);
  });
});

describe('POST /api/leads/intake — CORS', () => {
  it('never echoes an origin that is not on the allowlist', async () => {
    const saved = process.env.LEAD_ALLOWED_ORIGINS;
    process.env.LEAD_ALLOWED_ORIGINS = 'https://residencyfirst.com';
    try {
      const response = await post(LEAD, authed({ origin: 'https://evil.example' }));
      expect(response.headers.get('Access-Control-Allow-Origin')).toBeNull();

      const allowed = await post(
        { fullName: 'Allowed', email: 'allowed@example.test' },
        authed({ origin: 'https://residencyfirst.com' }),
      );
      expect(allowed.headers.get('Access-Control-Allow-Origin')).toBe('https://residencyfirst.com');
    } finally {
      process.env.LEAD_ALLOWED_ORIGINS = saved;
    }
  });
});
