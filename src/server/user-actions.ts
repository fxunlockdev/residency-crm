'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthError, hashPassword, requireRoleOrThrow, requireRoleOrRedirect } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { fieldErrors, userSchema } from '@/lib/validation';
import { ROLE_LABEL } from '@/lib/labels';
import type { FormState } from './client-actions';

export async function createUserAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let actor;
  try {
    actor = await requireRoleOrThrow('ADMIN');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = userSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const { name, email, role, password } = parsed.data;
  if (!password) return { errors: { password: 'Set an initial password of at least 12 characters.' } };

  try {
    const user = await prisma.user.create({
      data: { name, email, role, passwordHash: await hashPassword(password) },
      select: { id: true },
    });
    await recordAudit({
      entity: 'User',
      entityId: user.id,
      action: 'created',
      actor,
      summary: `${actor.name} added ${name} as ${ROLE_LABEL[role]}`,
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { errors: { email: 'That email address already has an account.' } };
    }
    throw error;
  }

  revalidatePath('/settings');
  return { ok: true, message: `${name} can now sign in.` };
}

export async function updateUserAction(userId: string, _previous: FormState, formData: FormData): Promise<FormState> {
  let actor;
  try {
    actor = await requireRoleOrThrow('ADMIN');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = userSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const existing = await prisma.user.findUnique({ where: { id: userId } });
  if (!existing) return { message: 'That user no longer exists.' };

  const { name, email, role, password } = parsed.data;

  // An administrator must not be able to lock everyone out by demoting the last admin.
  if (existing.role === 'ADMIN' && role !== 'ADMIN') {
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    if (admins <= 1) return { message: 'There must always be at least one active administrator.' };
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name,
        email,
        role,
        ...(password ? { passwordHash: await hashPassword(password) } : {}),
      },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { errors: { email: 'That email address already has an account.' } };
    }
    throw error;
  }

  await recordAudit({
    entity: 'User',
    entityId: userId,
    action: 'updated',
    actor,
    summary: `${actor.name} updated ${name}${password ? ' and reset their password' : ''}`,
  });

  revalidatePath('/settings');
  return { ok: true, message: 'Saved.' };
}

export async function toggleUserAction(formData: FormData): Promise<void> {
  const actor = await requireRoleOrRedirect('ADMIN');
  const userId = String(formData.get('userId') ?? '');
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  if (user.isActive) {
    if (user.id === actor.id) return; // Never deactivate yourself.
    const admins = await prisma.user.count({ where: { role: 'ADMIN', isActive: true } });
    if (user.role === 'ADMIN' && admins <= 1) return;
  }

  await prisma.user.update({ where: { id: userId }, data: { isActive: !user.isActive } });
  await recordAudit({
    entity: 'User',
    entityId: userId,
    action: 'updated',
    field: 'isActive',
    oldValue: String(user.isActive),
    newValue: String(!user.isActive),
    actor,
    summary: `${actor.name} ${user.isActive ? 'deactivated' : 'reactivated'} ${user.name}`,
  });

  revalidatePath('/settings');
}

export async function createReferenceAction(formData: FormData): Promise<void> {
  const actor = await requireRoleOrRedirect('ADMIN');
  const kind = String(formData.get('kind') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  if (!name) return;

  if (kind === 'centre') {
    await prisma.regionalCentre.upsert({ where: { name }, update: { isActive: true }, create: { name } });
  } else if (kind === 'project') {
    const centreId = String(formData.get('regionalCentreId') ?? '') || null;
    await prisma.project.upsert({
      where: { name },
      update: { isActive: true, regionalCentreId: centreId },
      create: { name, regionalCentreId: centreId },
    });
  } else {
    return;
  }

  await recordAudit({
    entity: 'User',
    entityId: actor.id,
    action: 'created',
    actor,
    summary: `${actor.name} added ${kind === 'centre' ? 'regional centre' : 'project'} "${name}"`,
  });

  revalidatePath('/settings');
}
