import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/prisma';

/**
 * Proves the concurrency guard at the database level: the WHERE clause on
 * `version` is what stops a stale form reverting someone else's work, so it has
 * to be exercised against a real Postgres, not a mock.
 */
const REF = 'TEST-CONC-1';

async function seedClient() {
  return prisma.client.create({
    data: { reference: REF, fullName: 'Concurrency Fixture', status: 'PROSPECT', source: 'OTHER' },
    select: { id: true, version: true },
  });
}

beforeEach(async () => {
  await prisma.client.deleteMany({ where: { reference: { startsWith: 'TEST-CONC' } } });
});

afterAll(async () => {
  await prisma.client.deleteMany({ where: { reference: { startsWith: 'TEST-CONC' } } });
  await prisma.$disconnect();
});

describe('optimistic locking on Client', () => {
  it('accepts a write that carries the current version and moves it on', async () => {
    const client = await seedClient();

    const result = await prisma.client.updateMany({
      where: { id: client.id, version: client.version },
      data: { nextAction: 'Send project deck', version: { increment: 1 } },
    });

    expect(result.count).toBe(1);
    const after = await prisma.client.findUnique({ where: { id: client.id } });
    expect(after?.version).toBe(client.version + 1);
    expect(after?.nextAction).toBe('Send project deck');
  });

  it('rejects the second of two saves made from the same loaded form', async () => {
    const client = await seedClient();
    const loadedVersion = client.version; // both advisors opened the form here

    const first = await prisma.client.updateMany({
      where: { id: client.id, version: loadedVersion },
      data: { nextAction: 'Advisor A edit', version: { increment: 1 } },
    });
    const second = await prisma.client.updateMany({
      where: { id: client.id, version: loadedVersion },
      data: { nextAction: 'Advisor B edit', version: { increment: 1 } },
    });

    expect(first.count).toBe(1);
    expect(second.count).toBe(0);

    // Advisor A's work survives rather than being silently reverted.
    const after = await prisma.client.findUnique({ where: { id: client.id } });
    expect(after?.nextAction).toBe('Advisor A edit');
    expect(after?.version).toBe(loadedVersion + 1);
  });

  it('lets exactly one of many simultaneous saves win', async () => {
    const client = await seedClient();

    const attempts = await Promise.all(
      Array.from({ length: 8 }, (_v, index) =>
        prisma.client.updateMany({
          where: { id: client.id, version: client.version },
          data: { nextAction: `writer ${index}`, version: { increment: 1 } },
        }),
      ),
    );

    expect(attempts.filter((a) => a.count === 1)).toHaveLength(1);
    expect((await prisma.client.findUnique({ where: { id: client.id } }))?.version).toBe(client.version + 1);
  });
});

describe('audit rows are written with the change', () => {
  it('rolls the audit row back when the write fails', async () => {
    const client = await seedClient();

    await expect(
      prisma.$transaction(async (tx) => {
        await tx.auditLog.create({
          data: { entity: 'Client', entityId: client.id, action: 'updated', summary: 'should not survive' },
        });
        // Force the transaction to abort after the audit row is staged.
        throw new Error('write failed');
      }),
    ).rejects.toThrow('write failed');

    const orphan = await prisma.auditLog.findFirst({ where: { entityId: client.id } });
    expect(orphan).toBeNull();
  });
});
