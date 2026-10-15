/**
 * Creates or updates an administrator account.
 *
 *   npx tsx scripts/create-admin.ts --email you@residencyfirst.com --name "Your Name" [--password ...]
 *
 * When no password is supplied a strong one is generated and printed once.
 */
import { randomBytes } from 'node:crypto';
import { PrismaClient, type Role } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

function arg(flag: string): string | undefined {
  const index = process.argv.indexOf(flag);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function generatePassword(): string {
  return randomBytes(12).toString('base64url');
}

async function main() {
  const email = (arg('--email') ?? process.env.ADMIN_EMAIL ?? '').toLowerCase().trim();
  const name = arg('--name') ?? process.env.ADMIN_NAME ?? 'Administrator';
  const role = (arg('--role') ?? 'ADMIN') as Role;
  if (!email) throw new Error('Pass --email you@example.com');

  const password = arg('--password') ?? process.env.ADMIN_PASSWORD ?? generatePassword();
  if (password.length < 12) throw new Error('Password must be at least 12 characters.');
  const passwordHash = await bcrypt.hash(password, 12);

  const user = await prisma.user.upsert({
    where: { email },
    update: { name, role, passwordHash, isActive: true },
    create: { email, name, role, passwordHash },
  });

  console.log(`\n${user.email} is ready as ${user.role}.`);
  if (!arg('--password') && !process.env.ADMIN_PASSWORD) {
    console.log(`Password (shown once): ${password}\n`);
  }
}

main()
  .catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
