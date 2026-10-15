/**
 * First-boot bootstrap. Plain JavaScript on purpose: the runtime image has no
 * TypeScript loader, so a .ts seeder could never run inside the container.
 *
 * Idempotent. Creates an administrator only when the users table is empty and
 * ADMIN_EMAIL / ADMIN_PASSWORD are both set. Never modifies an existing account.
 */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function main() {
  const existing = await prisma.user.count();
  if (existing > 0) {
    console.log(`[bootstrap] ${existing} user account(s) already exist — nothing to do.`);
    return;
  }

  const email = (process.env.ADMIN_EMAIL ?? '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD ?? '';
  const name = (process.env.ADMIN_NAME ?? '').trim() || 'Administrator';

  if (!email || !password) {
    console.warn(
      '[bootstrap] No users exist and ADMIN_EMAIL / ADMIN_PASSWORD are not set. ' +
        'Nobody will be able to sign in. Set both variables and redeploy.',
    );
    return;
  }

  if (password.length < 12) {
    console.error('[bootstrap] ADMIN_PASSWORD must be at least 12 characters. No account created.');
    process.exitCode = 1;
    return;
  }

  await prisma.user.create({
    data: { email, name, role: 'ADMIN', passwordHash: await bcrypt.hash(password, 12) },
  });
  console.log(`[bootstrap] Created the first administrator: ${email}`);
}

main()
  .catch((error) => {
    console.error('[bootstrap] failed:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
