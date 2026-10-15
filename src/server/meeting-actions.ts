'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { AuthError, requireRoleOrThrow, requireRoleOrRedirect } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { fieldErrors, meetingSchema } from '@/lib/validation';
import { MEETING_TYPE_LABEL } from '@/lib/labels';
import type { FormState } from './client-actions';

export async function createMeetingAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = meetingSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const input = parsed.data;
  const client = await prisma.client.findUnique({ where: { id: input.clientId }, select: { fullName: true } });
  if (!client) return { message: 'That client no longer exists.' };

  const meeting = await prisma.meeting.create({
    data: {
      clientId: input.clientId,
      occurredAt: input.occurredAt,
      type: input.type,
      attendees: input.attendees,
      summary: input.summary,
      createdById: user.id,
    },
    select: { id: true },
  });

  await recordAudit({
    entity: 'Meeting',
    entityId: meeting.id,
    action: 'created',
    actor: user,
    summary: `${user.name} logged a ${MEETING_TYPE_LABEL[input.type].toLowerCase()} with ${client.fullName}`,
  });

  revalidatePath(`/clients/${input.clientId}`);
  revalidatePath('/meetings');
  revalidatePath('/');
  return { ok: true, message: 'Meeting logged.' };
}

export async function deleteMeetingAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADVISOR');
  const id = String(formData.get('meetingId') ?? '');
  const meeting = await prisma.meeting.findUnique({
    where: { id },
    select: { clientId: true, client: { select: { fullName: true } } },
  });
  if (!meeting) return;

  await prisma.meeting.delete({ where: { id } });
  await recordAudit({
    entity: 'Meeting',
    entityId: id,
    action: 'deleted',
    actor: user,
    summary: `${user.name} removed a meeting from ${meeting.client.fullName}`,
  });

  revalidatePath(`/clients/${meeting.clientId}`);
  revalidatePath('/meetings');
}
