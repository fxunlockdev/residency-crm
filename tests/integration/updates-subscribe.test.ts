import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/updates/subscribe/route';
import { CONSENT_TEXTS } from '@/lib/validation';

/**
 * The second unauthenticated write path. Consent is the thing worth protecting
 * here: a signup must never be able to opt somebody out, and the channel rules
 * must hold even if the browser's own checks are bypassed. A mocked database
 * would not prove a rejected request writes nothing, so this runs against a
 * real Postgres.
 */
const TOKEN = 'integration-test-token';
const EMAIL = 'updates.probe@example.test';

const CONSENT = {
  consentVersion: 'eb5-updates-2026-10-28',
  consentText: 'Receive EB-5 news and deadline updates on selected channels.',
  signupType: 'eb5-deadline-updates',
  sourcePath: '/insights/',
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request('https://www.test/api/updates/subscribe', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    }) as never,
  );
}

const authed = (extra: Record<string, string> = {}) => ({
  'x-rf-token': TOKEN,
  'x-forwarded-for': `198.51.100.${Math.floor(Math.random() * 250) + 1}`,
  ...extra,
});

const EMAIL_SIGNUP = { ...CONSENT, name: 'Updates Probe', email: EMAIL, consentEmail: true, consentWhatsapp: false };

async function cleanUp() {
  await prisma.updateSubscription.deleteMany({
    where: { OR: [{ email: { endsWith: '@example.test' } }, { phone: { startsWith: '+99' } }] },
  });
  await prisma.rateLimit.deleteMany({ where: { key: { startsWith: 'updates:' } } });
}

beforeAll(() => {
  process.env.LEAD_INTAKE_TOKEN = TOKEN;
});
beforeEach(async () => {
  await cleanUp();
  // Neither provider should be reached from a test.
  vi.stubEnv('MAILERLITE_API_KEY', '');
  vi.stubEnv('MAILERSEND_API_TOKEN', '');
});
afterEach(() => vi.unstubAllEnvs());
afterAll(async () => {
  await cleanUp();
  await prisma.$disconnect();
});

describe('POST /api/updates/subscribe — authentication', () => {
  it('refuses a request with no token and writes nothing', async () => {
    const response = await post(EMAIL_SIGNUP, { 'x-forwarded-for': '198.51.100.9' });
    expect(response.status).toBe(401);
    expect(await prisma.updateSubscription.count({ where: { email: EMAIL } })).toBe(0);
  });

  it('fails closed when no token is configured at all', async () => {
    const original = process.env.LEAD_INTAKE_TOKEN;
    delete process.env.LEAD_INTAKE_TOKEN;
    const response = await post(EMAIL_SIGNUP, authed());
    expect(response.status).toBe(503);
    process.env.LEAD_INTAKE_TOKEN = original;
  });
});

describe('POST /api/updates/subscribe — the happy path', () => {
  it('stores an email signup with the consent it was given', async () => {
    const response = await post(EMAIL_SIGNUP, authed());
    expect(response.status).toBe(201);
    // The browser checks for this and nothing else.
    expect(await response.json()).toEqual({ ok: true });

    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.consentEmail).toBe(true);
    expect(row.consentWhatsapp).toBe(false);
    expect(row.consentVersion).toBe(CONSENT.consentVersion);
    // Our published wording, not whatever the caller posted. A consent record
    // built from the caller's own text would be worthless as evidence.
    expect(row.consentText).toBe(CONSENT_TEXTS[CONSENT.consentVersion]);
    expect(row.consentText).not.toBe(CONSENT.consentText);
    expect(row.sourcePath).toBe('/insights/');
    expect(row.unsubscribeToken).toMatch(/^[\w-]{20,}$/);
    expect(row.unsubscribedAt).toBeNull();
  });

  it('accepts a WhatsApp-only signup, which has no email at all', async () => {
    const response = await post(
      { ...CONSENT, name: 'WhatsApp Only', phone: '+990000001', consentWhatsapp: true, consentEmail: false },
      authed(),
    );
    expect(response.status).toBe(201);
    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { phone: '+990000001' } });
    expect(row.email).toBeNull();
    expect(row.consentWhatsapp).toBe(true);
  });

  it('gives every subscriber a different unsubscribe token', async () => {
    await post(EMAIL_SIGNUP, authed());
    await post({ ...EMAIL_SIGNUP, email: 'second.probe@example.test' }, authed());
    const rows = await prisma.updateSubscription.findMany({ where: { email: { endsWith: '@example.test' } } });
    expect(new Set(rows.map((r) => r.unsubscribeToken)).size).toBe(2);
  });
});

describe('POST /api/updates/subscribe — consent discipline', () => {
  it('adds a channel on a second signup without creating a second row', async () => {
    await post(EMAIL_SIGNUP, authed());
    const response = await post(
      { ...EMAIL_SIGNUP, phone: '+990000002', consentWhatsapp: true, consentEmail: true },
      authed(),
    );
    expect(response.status).toBe(200);

    const rows = await prisma.updateSubscription.findMany({ where: { email: EMAIL } });
    expect(rows).toHaveLength(1);
    expect(rows[0].consentWhatsapp).toBe(true);
    expect(rows[0].consentEmail).toBe(true);
  });

  it('never turns a channel off, because a signup form is not an opt-out', async () => {
    await post({ ...EMAIL_SIGNUP, phone: '+990000003', consentEmail: true, consentWhatsapp: true }, authed());
    await post({ ...EMAIL_SIGNUP, consentEmail: true, consentWhatsapp: false }, authed());

    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.consentWhatsapp).toBe(true);
  });

  it('leaves someone who unsubscribed opted out, however the form is filled', async () => {
    await post(EMAIL_SIGNUP, authed());
    const optedOut = new Date();
    await prisma.updateSubscription.update({ where: { email: EMAIL }, data: { unsubscribedAt: optedOut } });

    // This endpoint is unauthenticated, so a signup naming an address is not
    // proof that its owner asked for anything. Resurrecting them silently is
    // the one thing an unsubscribe exists to prevent.
    const response = await post(EMAIL_SIGNUP, authed());
    expect(response.status).toBe(200);

    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.unsubscribedAt?.getTime()).toBe(optedOut.getTime());
  });

  it('refuses consent wording we never published', async () => {
    const response = await post({ ...EMAIL_SIGNUP, consentVersion: 'made-up-version' }, authed());
    expect(response.status).toBe(422);
    expect(await prisma.updateSubscription.count({ where: { email: EMAIL } })).toBe(0);
  });

  it('never lets one signup overwrite another subscriber\'s address', async () => {
    // Two people, one shared WhatsApp number.
    await post({ ...CONSENT, name: 'First', email: EMAIL, phone: '+990000900', consentEmail: true, consentWhatsapp: true }, authed());
    await post(
      { ...CONSENT, name: 'Second', email: 'second.probe@example.test', phone: '+990000900', consentEmail: true, consentWhatsapp: true },
      authed(),
    );

    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { phone: '+990000900' } });
    expect(row.email).toBe(EMAIL);
  });

  it('records when consent was received here, not whenever the browser claims', async () => {
    const before = new Date();
    await post(EMAIL_SIGNUP, authed());
    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.consentAt.getTime()).toBeGreaterThanOrEqual(before.getTime() - 1000);
    expect(row.consentAt.getTime()).toBeLessThanOrEqual(Date.now() + 1000);
  });
});

describe('POST /api/updates/subscribe — validation', () => {
  const cases: Array<[string, Record<string, unknown>]> = [
    ['no channel chosen', { ...CONSENT, email: EMAIL, consentEmail: false, consentWhatsapp: false }],
    ['email channel with no address', { ...CONSENT, consentEmail: true, consentWhatsapp: false }],
    ['WhatsApp channel with no number', { ...CONSENT, email: EMAIL, consentEmail: false, consentWhatsapp: true }],
    ['an address that is not one', { ...CONSENT, email: 'not-an-email', consentEmail: true, consentWhatsapp: false }],
    ['no consent wording', { email: EMAIL, consentEmail: true, consentWhatsapp: false, signupType: 'x' }],
  ];

  for (const [name, body] of cases) {
    it(`rejects ${name} and writes nothing`, async () => {
      const response = await post(body, authed());
      expect(response.status).toBe(422);
      expect(await prisma.updateSubscription.count({ where: { email: EMAIL } })).toBe(0);
    });
  }

  it('rejects a body that is not JSON', async () => {
    const response = await POST(
      new Request('https://www.test/api/updates/subscribe', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authed() },
        body: 'not json',
      }) as never,
    );
    expect(response.status).toBe(400);
  });
});

describe('POST /api/updates/subscribe — rate limiting', () => {
  it('blocks a flood from one address', async () => {
    const ip = '198.51.100.251';
    const statuses: number[] = [];
    for (let i = 0; i < 8; i += 1) {
      const response = await post({ ...EMAIL_SIGNUP, email: `flood${i}@example.test` }, authed({ 'x-real-ip': ip }));
      statuses.push(response.status);
    }
    expect(statuses).toContain(429);
    expect(statuses.filter((s) => s === 201).length).toBeLessThanOrEqual(5);
  });
});
