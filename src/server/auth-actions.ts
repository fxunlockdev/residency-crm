'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { endSession, startSession, verifyPassword } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';

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
  const user = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });

  // One message for every failure mode, so the form cannot be used to enumerate accounts.
  const genericError = { error: 'Those details do not match an active account.' };
  if (!user || !user.isActive) {
    await verifyPassword(password, '$2a$12$0000000000000000000000000000000000000000000000000000');
    return genericError;
  }

  const valid = await verifyPassword(password, user.passwordHash);
  if (!valid) return genericError;

  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  await startSession({ sub: user.id, email: user.email, name: user.name, role: user.role });
  await recordAudit({
    entity: 'User',
    entityId: user.id,
    action: 'signed_in',
    actor: { id: user.id, name: user.name },
    summary: `${user.name} signed in`,
  });

  const target = parsed.data.next && parsed.data.next.startsWith('/') ? parsed.data.next : '/';
  redirect(target);
}

export async function logoutAction(): Promise<void> {
  await endSession();
  redirect('/login');
}
