'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma, type ClientStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthError, requireRoleOrThrow } from '@/lib/auth';
import { diffFields, recordAudit } from '@/lib/audit';
import { clientSchema, fieldErrors } from '@/lib/validation';
import { backfillStatusDate, commissionTriggerFor, conversionTypeFor } from '@/lib/status-rules';
import { STATUS_LABEL } from '@/lib/pipeline';
import { todayUtc } from '@/lib/dates';
import { nextReference } from './reference';

export type FormState = { errors?: Record<string, string>; message?: string; ok?: boolean };

function readForm(formData: FormData) {
  return Object.fromEntries(formData.entries());
}

export async function createClientAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = clientSchema.safeParse(readForm(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const input = parsed.data;
  const today = todayUtc();
  const backfill = backfillStatusDate(input.status, input, today);

  let createdId: string | null = null;
  for (let attempt = 0; attempt < 5 && !createdId; attempt += 1) {
    try {
      const created = await prisma.client.create({
        data: {
          reference: await nextReference(),
          fullName: input.fullName,
          email: input.email,
          secondaryEmail: input.secondaryEmail,
          phone: input.phone,
          countryOfResidence: input.countryOfResidence,
          countryOfBirth: input.countryOfBirth,
          source: input.source,
          referredById: input.referredById,
          referredByName: input.referredByName,
          status: input.status,
          attorney: input.attorney,
          caseWorker: input.caseWorker,
          regionalCentreId: input.regionalCentreId,
          projectId: input.projectId,
          investmentAmountCents: input.investmentAmount,
          dateFunded: input.dateFunded,
          i526eFiledDate: input.i526eFiledDate,
          i526eReceiptNumber: input.i526eReceiptNumber,
          i526eApprovedDate: input.i526eApprovedDate,
          greenCardIssuedDate: input.greenCardIssuedDate,
          i829FiledDate: input.i829FiledDate,
          i829ApprovedDate: input.i829ApprovedDate,
          nextAction: input.nextAction,
          followUpDate: input.followUpDate,
          marketingConsent: input.marketingConsent,
          notes: input.notes,
          ownerId: input.ownerId ?? user.id,
          ...backfill,
        },
        select: { id: true, reference: true, fullName: true },
      });
      createdId = created.id;

      await recordAudit({
        entity: 'Client',
        entityId: created.id,
        action: 'created',
        actor: user,
        summary: `${user.name} added ${created.fullName} (${created.reference})`,
      });
      await applyStatusSideEffects(created.id, input.status, user, input.investmentAmount);
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }
  }

  if (!createdId) return { message: 'Could not allocate a client reference. Try again.' };

  revalidatePath('/clients');
  revalidatePath('/');
  redirect(`/clients/${createdId}`);
}

export async function updateClientAction(
  clientId: string,
  _previous: FormState,
  formData: FormData,
): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = clientSchema.safeParse(readForm(formData));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const existing = await prisma.client.findUnique({ where: { id: clientId } });
  if (!existing) return { message: 'That client no longer exists.' };

  const input = parsed.data;
  const statusChanged = existing.status !== input.status;
  const backfill = statusChanged
    ? backfillStatusDate(input.status, { ...existing, ...input }, todayUtc())
    : {};

  const data = {
    fullName: input.fullName,
    email: input.email,
    secondaryEmail: input.secondaryEmail,
    phone: input.phone,
    countryOfResidence: input.countryOfResidence,
    countryOfBirth: input.countryOfBirth,
    source: input.source,
    referredById: input.referredById === clientId ? null : input.referredById,
    referredByName: input.referredByName,
    status: input.status,
    attorney: input.attorney,
    caseWorker: input.caseWorker,
    regionalCentreId: input.regionalCentreId,
    projectId: input.projectId,
    investmentAmountCents: input.investmentAmount,
    dateFunded: input.dateFunded,
    i526eFiledDate: input.i526eFiledDate,
    i526eReceiptNumber: input.i526eReceiptNumber,
    i526eApprovedDate: input.i526eApprovedDate,
    greenCardIssuedDate: input.greenCardIssuedDate,
    i829FiledDate: input.i829FiledDate,
    i829ApprovedDate: input.i829ApprovedDate,
    nextAction: input.nextAction,
    followUpDate: input.followUpDate,
    marketingConsent: input.marketingConsent,
    notes: input.notes,
    ownerId: input.ownerId,
    ...backfill,
  };

  await prisma.client.update({ where: { id: clientId }, data });

  const changes = diffFields(existing as unknown as Record<string, unknown>, data as Record<string, unknown>);
  for (const change of changes) {
    await recordAudit({
      entity: 'Client',
      entityId: clientId,
      action: change.field === 'status' ? 'status_changed' : 'updated',
      field: change.field,
      oldValue: change.oldValue,
      newValue: change.newValue,
      actor: user,
      summary:
        change.field === 'status'
          ? `${user.name} moved ${existing.fullName} to ${STATUS_LABEL[input.status]}`
          : `${user.name} updated ${labelForField(change.field)} on ${existing.fullName}`,
    });
  }

  if (statusChanged) {
    await applyStatusSideEffects(clientId, input.status, user, input.investmentAmount);
  }

  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/');
  return { ok: true, message: 'Saved.' };
}

/** Used by the pipeline board and the quick actions on the client record. */
export async function changeStatusAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrThrow('ADVISOR');
  const clientId = String(formData.get('clientId') ?? '');
  const status = String(formData.get('status') ?? '') as ClientStatus;
  if (!clientId || !status) return;

  const existing = await prisma.client.findUnique({ where: { id: clientId } });
  if (!existing || existing.status === status) return;

  const backfill = backfillStatusDate(status, existing, todayUtc());
  await prisma.client.update({ where: { id: clientId }, data: { status, ...backfill } });

  await recordAudit({
    entity: 'Client',
    entityId: clientId,
    action: 'status_changed',
    field: 'status',
    oldValue: existing.status,
    newValue: status,
    actor: user,
    summary: `${user.name} moved ${existing.fullName} to ${STATUS_LABEL[status]}`,
  });

  await applyStatusSideEffects(clientId, status, user, existing.investmentAmountCents);

  revalidatePath('/pipeline');
  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/');
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrThrow('ADMIN');
  const clientId = String(formData.get('clientId') ?? '');
  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { fullName: true, reference: true } });
  if (!client) return;

  await prisma.client.delete({ where: { id: clientId } });
  await recordAudit({
    entity: 'Client',
    entityId: clientId,
    action: 'deleted',
    actor: user,
    summary: `${user.name} deleted ${client.fullName} (${client.reference})`,
  });

  revalidatePath('/clients');
  revalidatePath('/');
  redirect('/clients');
}

/**
 * Moves matching commissions from Not due to Due and queues the Google Ads conversion.
 * Both are spec requirements of a status change.
 */
async function applyStatusSideEffects(
  clientId: string,
  status: ClientStatus,
  user: { id: string; name: string },
  investmentCents: number | null,
): Promise<void> {
  const trigger = commissionTriggerFor(status);
  if (trigger) {
    const due = await prisma.commission.updateMany({
      where: { clientId, trigger, status: 'NOT_DUE' },
      data: { status: 'DUE' },
    });
    if (due.count > 0) {
      await recordAudit({
        entity: 'Commission',
        entityId: clientId,
        action: 'updated',
        actor: user,
        summary: `${due.count} commission${due.count === 1 ? '' : 's'} became due on reaching ${STATUS_LABEL[status]}`,
      });
    }
  }

  const conversionType = conversionTypeFor(status);
  if (!conversionType) return;

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { gclid: true } });
  // Events are always recorded; the uploader skips them when Google Ads is not configured.
  await prisma.conversionEvent.upsert({
    where: { clientId_type: { clientId, type: conversionType } },
    update: {},
    create: {
      clientId,
      type: conversionType,
      gclid: client?.gclid ?? null,
      valueCents: conversionType === 'FUNDED' ? await expectedCommissionCents(clientId, investmentCents) : null,
      status: client?.gclid ? 'PENDING' : 'SKIPPED',
    },
  });
}

async function expectedCommissionCents(clientId: string, fallback: number | null): Promise<number | null> {
  const total = await prisma.commission.aggregate({ where: { clientId }, _sum: { amountCents: true } });
  return total._sum.amountCents || fallback;
}

const FIELD_LABELS: Record<string, string> = {
  fullName: 'the name',
  email: 'the email address',
  phone: 'the phone number',
  followUpDate: 'the follow-up date',
  nextAction: 'the next action',
  notes: 'the notes',
  investmentAmountCents: 'the investment amount',
  i526eReceiptNumber: 'the I-526E receipt number',
  marketingConsent: 'marketing consent',
};

function labelForField(field: string): string {
  return FIELD_LABELS[field] ?? field;
}
