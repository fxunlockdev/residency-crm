'use server';

import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { endSession, startSession, verifyPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { pruneRateLimits, rateLimit } from '@/lib/rate-limit';
import { clientIpFrom } from '@/lib/client-ip';
import { safeRedirectTarget } from '@/lib/safe-redirect';

export type LoginState = { error?: string };

const loginSchema = z.object({
  email: z.string().trim().min(1, 'Enter your email address.').email('Enter a valid email address.'),
  password: z.string().min(1, 'Enter your password.'),
  next: z.string().nullish(),
});

export async function loginAction(_previous: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = loginSchema.safeParse({
    email: formData.get('email'),
    password: formData.get('password'),
    next: formData.get('next'),
  });

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? 'Check the details you entered.' };
  }

  const { email, password } = parsed.data;

  // Online guessing is only bounded by bcrypt otherwise, and a failed attempt
  // should be visible to an administrator in the audit log.
  pruneRateLimits();
  const requestHeaders = await headers();
  const ip = clientIpFrom(requestHeaders);
  const perAccount = rateLimit(`login:account:${email.toLowerCase()}`, 8, 15 * 60_000);
  const perIp = rateLimit(`login:ip:${ip}`, 20, 15 * 60_000);
  if (!perAccount.allowed || !perIp.allowed) {
    const retryAfter = Math.max(perAccount.retryAfter, perIp.retryAfter);
    const minutes = Math.max(1, Math.ceil(retryAfter / 60));
    return { error: `Too many sign-in attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.` };
  }

  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // One message for every failure mode, so the form cannot be used to enumerate accounts.
  const genericError = { error: 'Those details do not match an active account.' };
  if (!user || !user.isActive) {
    await verifyPassword(password, '$2a$12$0000000000000000000000000000000000000000000000000000');
    await recordFailure(email, ip);
    return genericError;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) {
    await recordFailure(email, ip);
    return genericError;
  }

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
  await recordAudit({
    entity: 'User',
    entityId: user.id,
    action: 'signed_in',
    actor: { id: user.id, name: user.name },
    summary: `${user.name} signed in`,
  });

  redirect(safeRedirectTarget(parsed.data.next));
}

/** Failed sign-ins are recorded so repeated attempts are visible in the activity log. */
async function recordFailure(email: string, ip: string): Promise<void> {
  await recordAudit({
    entity: 'User',
    entityId: 'login',
    action: 'signed_in',
    field: 'failed',
    newValue: email,
    actorLabel: 'Failed sign-in',
    summary: `Failed sign-in for ${email} from ${ip}`,
  });
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect('/login');
}
