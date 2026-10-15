/**
 * Moves an account to a new email address, keeping its password, role and
 * audit history. Writes an audit row, unlike editing the database by hand.
 *
 *   npx tsx scripts/change-user-email.ts --from old@example.com --to new@example.com [--role ADMIN]
 *
 * If the destination address already has an account, that one is kept and the
 * old record is removed instead.
 */
import { PrismaClient, type Role } from '@prisma/client';

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

async function main() {
  const from = (arg('--from') ?? '').toLowerCase().trim();
  const to = (arg('--to') ?? '').toLowerCase().trim();
  const role = arg('--role') as Role | undefined;
  if (!from || !to) throw new Error('Pass --from old@example.com --to new@example.com');

  const [source, destination] = await Promise.all([
    prisma.user.findUnique({ where: { email: from } }),
    prisma.user.findUnique({ where: { email: to } }),
  ]);

  if (destination) {
    await prisma.user.update({
      where: { email: to },
      data: { isActive: true, ...(role ? { role } : {}) },
    });
    if (source) {
      await prisma.user.delete({ where: { email: from } });
      console.log(`${to} already existed; kept it and removed ${from}.`);
    } else {
      console.log(`${to} already existed; confirmed active.`);
    }
  } else if (source) {
    await prisma.user.update({
      where: { email: from },
      data: { email: to, isActive: true, ...(role ? { role } : {}) },
    });
    console.log(`Renamed ${from} -> ${to}. Password and history unchanged.`);
  } else {
    throw new Error(`Neither ${from} nor ${to} has an account.`);
  }

  const user = await prisma.user.findUnique({ where: { email: to } });
  if (user) {
    await prisma.auditLog.create({
      data: {
        entity: 'User',
        entityId: user.id,
        action: 'updated',
        field: 'email',
        oldValue: from,
        newValue: to,
        actorLabel: 'change-user-email script',
        summary: `Account email changed from ${from} to ${to}`,
      },
    });
  }

  const users = await prisma.user.findMany({
    select: { email: true, name: true, role: true, isActive: true },
    orderBy: { email: 'asc' },
  });
  console.table(users);
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
