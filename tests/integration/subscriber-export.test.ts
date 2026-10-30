import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashPassword } from '@/lib/auth';

/**
 * Who can walk off with the marketing list.
 *
 * The route is driven for real, with a real session, because the defect a
 * review found was not in the role helper: it was that the handler never
 * called one. Only a test that reaches the handler can see that.
 */
const PREFIX = 'export-probe';

async function user(role: 'VIEWER' | 'ADVISOR' | 'ADMIN') {
  const email = `${PREFIX}.${role.toLowerCase()}@example.test`;
  return prisma.user.upsert({
    where: { email },
    update: { role, isActive: true },
    create: { email, name: `Export ${role}`, role, isActive: true, passwordHash: await hashPassword('x'.repeat(16)) },
    select: { id: true, email: true, name: true, role: true, isActive: true },
  });
}

/**
 * `getCurrentUser` reads a cookie through `next/headers`, which has no
 * request to read outside a server context. Standing in for it is the point:
 * what is under test is what the handler does with the user it is given.
 */
async function exportAs(signedInAs: Awaited<ReturnType<typeof user>> | null) {
  vi.resetModules();
  vi.doMock('@/lib/auth', async () => {
    const actual = await vi.importActual<typeof import('@/lib/auth')>('@/lib/auth');
    return { ...actual, getCurrentUser: async () => signedInAs };
  });

  const { GET } = await import('@/app/api/subscribers/export/route');
  // NextRequest, not Request: the handler reads the filters from nextUrl.
  return GET(new NextRequest('https://crm.test/api/subscribers/export?status=any&channel=all'));
}

const hasDatabase = Boolean(process.env.DATABASE_URL);
const when = hasDatabase ? describe : describe.skip;

when('the subscriber export', () => {
  beforeAll(async () => {
    await prisma.updateSubscription.upsert({
      where: { email: `${PREFIX}@example.test` },
      update: {},
      create: {
        email: `${PREFIX}@example.test`,
        name: 'Export Probe',
        consentEmail: true,
        consentWhatsapp: false,
        consentAt: new Date(),
        consentVersion: 'test',
        consentText: 'test',
        signupType: 'eb5-deadline-updates',
        unsubscribeToken: `${PREFIX}-token`,
      },
    });
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { entity: 'UpdateSubscription', entityId: 'export' } });
    await prisma.updateSubscription.deleteMany({ where: { email: `${PREFIX}@example.test` } });
    await prisma.user.deleteMany({ where: { email: { startsWith: PREFIX } } });
    vi.doUnmock('@/lib/auth');
  });

  it('refuses a signed-out request', async () => {
    expect((await exportAs(null)).status).toBe(401);
  });

  it('refuses a viewer, who can read the list but must not take all of it', async () => {
    const response = await exportAs(await user('VIEWER'));
    expect(response.status).toBe(403);
    expect(await response.text()).not.toContain(`${PREFIX}@example.test`);
  });

  it('gives an advisor the CSV', async () => {
    const response = await exportAs(await user('ADVISOR'));
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/csv');

    const body = await response.text();
    expect(body).toContain(`${PREFIX}@example.test`);
    // The secret in every unsubscribe link must never leave in a spreadsheet.
    expect(body).not.toContain(`${PREFIX}-token`);
  });

  it('logs who took it', async () => {
    await exportAs(await user('ADMIN'));
    const entry = await prisma.auditLog.findFirst({
      where: { entity: 'UpdateSubscription', action: 'exported' },
      orderBy: { createdAt: 'desc' },
    });
    expect(entry?.summary).toContain('exported');
  });
});
