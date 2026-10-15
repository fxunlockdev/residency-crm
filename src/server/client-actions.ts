'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { Prisma, type ClientStatus } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthError, requireRoleOrThrow, requireRoleOrRedirect } from '@/lib/auth';
import { auditRow, diffFields, recordAudit } from '@/lib/audit';
import { clientSchema, fieldErrors } from '@/lib/validation';
import { backfillStatusDate, commissionTriggerFor, conversionTypeFor, stagesCrossed } from '@/lib/status-rules';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/pipeline';
import { todayUtc } from '@/lib/dates';
import { removeUpload } from '@/lib/storage';
import { nextReference } from './reference';

export type FormState = {
  errors?: Record<string, string>;
  message?: string;
  ok?: boolean;
  /** Set when the save lost a race: the form should be reloaded, not retried. */
  conflict?: boolean;
};

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
      await applyStatusSideEffects(created.id, input.status, user);
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

  const changes = diffFields(existing as unknown as Record<string, unknown>, data as Record<string, unknown>);

  // The write and its audit rows land together, so a failure can never leave a
  // changed record with no trace of who changed it. The version in the WHERE
  // clause is the concurrency guard: a stale form matches nothing.
  const applied = await prisma.$transaction(async (tx) => {
    const result = await tx.client.updateMany({
      where: { id: clientId, version: input.version },
      data: { ...data, version: { increment: 1 } },
    });
    if (result.count === 0) return false;

    if (changes.length > 0) {
      await tx.auditLog.createMany({
        data: changes.map((change) =>
          auditRow({
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
          }),
        ),
      });
    }
    return true;
  });

  if (!applied) {
    // Someone else saved while this form was open. Reverting their work
    // silently is worse than making the user look at what changed.
    return {
      message:
        'This record was changed by someone else while you had it open. ' +
        'Reload to see their changes, then reapply yours.',
      conflict: true,
    };
  }

  if (statusChanged) {
    await applyStatusSideEffects(clientId, input.status, user, existing.status);
  }

  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/');
  return { ok: true, message: 'Saved.' };
}

/** Used by the pipeline board and the quick actions on the client record. */
export async function changeStatusAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADVISOR');
  const clientId = String(formData.get('clientId') ?? '');
  const raw = String(formData.get('status') ?? '');
  if (!clientId || !(STATUS_ORDER as string[]).includes(raw)) return;
  const status = raw as ClientStatus;

  const existing = await prisma.client.findUnique({ where: { id: clientId } });
  if (!existing || existing.status === status) return;

  const backfill = backfillStatusDate(status, existing, todayUtc());

  // Conditional on the status we read, so two advisors moving the same card at
  // once cannot both run their side effects against a stale starting stage.
  const moved = await prisma.client.updateMany({
    where: { id: clientId, status: existing.status },
    data: { status, ...backfill, version: { increment: 1 } },
  });
  if (moved.count === 0) {
    revalidatePath(`/clients/${clientId}`);
    revalidatePath('/pipeline');
    return;
  }

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

  await applyStatusSideEffects(clientId, status, user, existing.status);

  revalidatePath('/pipeline');
  revalidatePath('/clients');
  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/');
}

export async function deleteClientAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADMIN');
  const clientId = String(formData.get('clientId') ?? '');
  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      fullName: true,
      reference: true,
      commissions: { select: { amountCents: true, status: true, invoiceNumber: true, trigger: true } },
      documents: { select: { storageKey: true } },
      _count: { select: { meetings: true } },
    },
  });
  if (!client) return;

  // Everything cascades, so a client with settled money would take the revenue
  // record with it. Those are kept; "Lost / Not proceeding" is the way out.
  const settled = client.commissions.filter((c) => c.status === 'PAID' || c.status === 'INVOICED');
  if (settled.length > 0) {
    redirect(`/clients/${clientId}?error=has-financials`);
  }

  // Serialise what is about to disappear so the audit log is not left with a
  // name and nothing else.
  const snapshot = JSON.stringify({
    commissions: client.commissions,
    meetings: client._count.meetings,
    documents: client.documents.length,
  });

  await prisma.client.delete({ where: { id: clientId } });
  // The rows cascade, the bytes do not.
  for (const document of client.documents) {
    await removeUpload(document.storageKey);
  }

  await recordAudit({
    entity: 'Client',
    entityId: clientId,
    action: 'deleted',
    actor: user,
    oldValue: snapshot,
    summary: `${user.name} deleted ${client.fullName} (${client.reference})`,
  });

  revalidatePath('/clients');
  revalidatePath('/');
  redirect('/clients');
}

/**
 * Applies the side effects of landing on `status`, having come from `from`.
 *
 * Stages can be skipped (the board lets a card be dragged anywhere), so every
 * stage crossed is applied, not just the destination. Otherwise moving
 * Prospect straight to I-526E filed would leave the on-funding commission stuck
 * at Not due forever and never record the Funded conversion.
 */
async function applyStatusSideEffects(
  clientId: string,
  status: ClientStatus,
  user: { id: string; name: string },
  from?: ClientStatus,
): Promise<void> {
  const crossed = stagesCrossed(from, status);

  for (const stage of crossed) {
    const trigger = commissionTriggerFor(stage);
    if (!trigger) continue;
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
        summary: `${due.count} commission${due.count === 1 ? '' : 's'} became due on reaching ${STATUS_LABEL[stage]}`,
      });
    }
  }

  const client = await prisma.client.findUnique({ where: { id: clientId }, select: { gclid: true } });

  for (const stage of crossed) {
    const conversionType = conversionTypeFor(stage);
    if (!conversionType) continue;

    const valueCents = conversionType === 'FUNDED' ? await expectedCommissionCents(clientId) : null;
    const queueState = client?.gclid ? 'PENDING' : 'SKIPPED';

    // Refresh the queued event rather than freezing whatever was true the first
    // time: a GCLID or a commission recorded later must still reach Google Ads.
    await prisma.conversionEvent.upsert({
      where: { clientId_type: { clientId, type: conversionType } },
      update: {
        gclid: client?.gclid ?? null,
        ...(valueCents === null ? {} : { valueCents }),
        status: { set: queueState },
      },
      create: {
        clientId,
        type: conversionType,
        gclid: client?.gclid ?? null,
        valueCents,
        status: queueState,
      },
    });
  }
}


async function expectedCommissionCents(clientId: string): Promise<number | null> {
  const total = await prisma.commission.aggregate({ where: { clientId }, _sum: { amountCents: true } });
  return total._sum.amountCents ?? null;
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
