import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { POST } from '@/app/api/updates/unsubscribe/route';

/**
 * Leaving the EB-5 updates list.
 *
 * The thing worth protecting is that nobody is told they have unsubscribed
 * when they have not. A truncated or rewritten link is ordinary, and a
 * cheerful "you are unsubscribed" in reply to one leaves a person receiving
 * mail they have asked twice to stop.
 */
const TOKEN = 'integration-unsubscribe-token-abcdef';
const EMAIL = 'unsubscribe.probe@example.test';

function post(token: string, headers: Record<string, string> = {}) {
  return POST(
    new NextRequest(`https://crm.test/api/updates/unsubscribe?token=${encodeURIComponent(token)}`, {
      method: 'POST',
      headers: { 'x-rf-token': process.env.LEAD_INTAKE_TOKEN ?? '', ...headers },
    }),
  );
}

const hasDatabase = Boolean(process.env.DATABASE_URL && process.env.LEAD_INTAKE_TOKEN);
const when = hasDatabase ? describe : describe.skip;

when('unsubscribing', () => {
  beforeEach(async () => {
    await prisma.updateSubscription.deleteMany({ where: { email: EMAIL } });
    await prisma.updateSubscription.create({
      data: {
        email: EMAIL,
        name: 'Unsubscribe Probe',
        consentEmail: true,
        consentWhatsapp: true,
        consentAt: new Date(),
        consentVersion: 'test',
        consentText: 'test',
        signupType: 'eb5-deadline-updates',
        unsubscribeToken: TOKEN,
      },
    });
  });

  afterAll(async () => {
    await prisma.updateSubscription.deleteMany({ where: { email: EMAIL } });
  });

  it('records the opt-out and withdraws both channels', async () => {
    const response = await post(TOKEN);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true, state: 'unsubscribed' });

    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.unsubscribedAt).not.toBeNull();
    expect(row.consentEmail).toBe(false);
    expect(row.consentWhatsapp).toBe(false);
  });

  it('treats a second click as success, not a failure', async () => {
    await post(TOKEN);
    const again = await post(TOKEN);
    expect(again.status).toBe(200);
    expect(await again.json()).toEqual({ ok: true, state: 'already' });
  });

  it('says plainly that it does not know an unmatched token', async () => {
    const response = await post('a-token-that-was-never-issued');
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ ok: false, state: 'unknown' });

    // And changes nothing.
    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.unsubscribedAt).toBeNull();
  });

  it('refuses a caller without the shared token', async () => {
    const response = await POST(
      new NextRequest(`https://crm.test/api/updates/unsubscribe?token=${TOKEN}`, { method: 'POST' }),
    );
    expect(response.status).toBe(401);

    const row = await prisma.updateSubscription.findUniqueOrThrow({ where: { email: EMAIL } });
    expect(row.unsubscribedAt).toBeNull();
  });

  it('refuses a request with no token at all', async () => {
    const response = await POST(
      new NextRequest('https://crm.test/api/updates/unsubscribe', {
        method: 'POST',
        headers: { 'x-rf-token': process.env.LEAD_INTAKE_TOKEN ?? '' },
      }),
    );
    expect(response.status).toBe(400);
  });
});
