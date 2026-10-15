'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { AuthError, requireRoleOrThrow } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { commissionSchema, fieldErrors } from '@/lib/validation';
import { COMMISSION_STATUS_LABEL, COMMISSION_TRIGGER_LABEL } from '@/lib/labels';
import { formatCents } from '@/lib/money';
import type { FormState } from './client-actions';

export async function createCommissionAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = commissionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const input = parsed.data;
  const client = await prisma.client.findUnique({
    where: { id: input.clientId },
    select: { fullName: true, regionalCentreId: true },
  });
  if (!client) return { message: 'That client no longer exists.' };

  const commission = await prisma.commission.create({
    data: {
      clientId: input.clientId,
      // Invoices go to the regional centre, so it is inherited from the client.
      regionalCentreId: client.regionalCentreId,
      amountCents: input.amount ?? 0,
      trigger: input.trigger,
      status: input.status,
      invoiceNumber: input.invoiceNumber,
      invoiceSentDate: input.invoiceSentDate,
      paymentDueDate: input.paymentDueDate,
      paymentReceivedDate: input.paymentReceivedDate,
      amountReceivedCents: input.amountReceived,
      notes: input.notes,
    },
    select: { id: true },
  });

  await recordAudit({
    entity: 'Commission',
    entityId: commission.id,
    action: 'created',
    actor: user,
    summary: `${user.name} added a ${formatCents(input.amount)} commission (${COMMISSION_TRIGGER_LABEL[input.trigger]}) for ${client.fullName}`,
  });

  revalidatePath(`/clients/${input.clientId}`);
  revalidatePath('/commissions');
  revalidatePath('/');
  return { ok: true, message: 'Commission added.' };
}

export async function updateCommissionAction(
  commissionId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = commissionSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const existing = await prisma.commission.findUnique({
    where: { id: commissionId },
    include: { client: { select: { fullName: true } } },
  });
  if (!existing) return { message: 'That commission no longer exists.' };

  const input = parsed.data;
  await prisma.commission.update({
    where: { id: commissionId },
    data: {
      amountCents: input.amount ?? 0,
      trigger: input.trigger,
      status: input.status,
      invoiceNumber: input.invoiceNumber,
      invoiceSentDate: input.invoiceSentDate,
      paymentDueDate: input.paymentDueDate,
      paymentReceivedDate: input.paymentReceivedDate,
      amountReceivedCents: input.amountReceived,
      notes: input.notes,
      // A recorded payment date supersedes the legacy "paid, date unknown" marker.
      paidDateUnknown: input.paymentReceivedDate ? false : existing.paidDateUnknown,
    },
  });

  if (existing.status !== input.status) {
    await recordAudit({
      entity: 'Commission',
      entityId: commissionId,
      action: 'updated',
      field: 'status',
      oldValue: existing.status,
      newValue: input.status,
      actor: user,
      summary: `${user.name} marked ${existing.client.fullName}'s commission ${COMMISSION_STATUS_LABEL[input.status]}`,
    });
  }

  revalidatePath(`/clients/${existing.clientId}`);
  revalidatePath('/commissions');
  revalidatePath('/');
  return { ok: true, message: 'Commission saved.' };
}

/** One-click transitions from the commissions queue. */
export async function advanceCommissionAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrThrow('ADVISOR');
  const id = String(formData.get('commissionId') ?? '');
  const next = String(formData.get('status') ?? '');
  if (!id || !next) return;

  const existing = await prisma.commission.findUnique({
    where: { id },
    include: { client: { select: { fullName: true } } },
  });
  if (!existing) return;

  const data: Record<string, unknown> = { status: next };
  if (next === 'INVOICED' && !existing.invoiceSentDate) data.invoiceSentDate = new Date();
  if (next === 'PAID') {
    if (!existing.paymentReceivedDate) data.paymentReceivedDate = new Date();
    if (existing.amountReceivedCents === null) data.amountReceivedCents = existing.amountCents;
    data.paidDateUnknown = false;
  }

  await prisma.commission.update({ where: { id }, data });
  await recordAudit({
    entity: 'Commission',
    entityId: id,
    action: 'updated',
    field: 'status',
    oldValue: existing.status,
    newValue: next,
    actor: user,
    summary: `${user.name} marked ${existing.client.fullName}'s commission ${COMMISSION_STATUS_LABEL[next as keyof typeof COMMISSION_STATUS_LABEL]}`,
  });

  revalidatePath('/commissions');
  revalidatePath(`/clients/${existing.clientId}`);
  revalidatePath('/');
}

export async function deleteCommissionAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrThrow('ADMIN');
  const id = String(formData.get('commissionId') ?? '');
  const existing = await prisma.commission.findUnique({
    where: { id },
    select: { clientId: true, client: { select: { fullName: true } } },
  });
  if (!existing) return;

  await prisma.commission.delete({ where: { id } });
  await recordAudit({
    entity: 'Commission',
    entityId: id,
    action: 'deleted',
    actor: user,
    summary: `${user.name} deleted a commission for ${existing.client.fullName}`,
  });

  revalidatePath('/commissions');
  revalidatePath(`/clients/${existing.clientId}`);
}
