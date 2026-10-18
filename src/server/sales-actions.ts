'use server';

import { revalidatePath } from 'next/cache';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { AuthError, requireRoleOrRedirect, requireRoleOrThrow } from '@/lib/auth';
import { auditRow, recordAudit } from '@/lib/audit';
import { fieldErrors } from '@/lib/validation';
import { parseMoneyToCents } from '@/lib/money';
import { formatCents } from '@/lib/money';
import { todayUtc } from '@/lib/dates';
import { normalizeCountry, normalizePhone, toTitleCase } from '@/lib/normalize';
import { nextReference } from './reference';
import type { FormState } from './client-actions';

/** Adding a prospect from the board is deliberately light: four fields. */
const prospectSchema = z.object({
  fullName: z.string().trim().min(2, 'Enter the prospect’s name.').max(160),
  phone: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === 'string' ? v.trim() : ''))
    .transform((v) => (v === '' ? null : v)),
  countryOfBirth: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === 'string' ? v.trim() : ''))
    .transform((v) => (v === '' ? null : v)),
  potentialRevenue: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((v) => (typeof v === 'string' ? v.trim() : ''))
    .refine((v) => v === '' || /^\d{1,9}(\.\d{1,2})?$/.test(v.replace(/[$,\s]/g, '')), {
      message: 'Enter a plain amount, for example 40000.',
    })
    .transform((v) => (v === '' ? null : parseMoneyToCents(v))),
});

export async function addProspectAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const parsed = prospectSchema.safeParse(Object.fromEntries(formData.entries()));
  if (!parsed.success) return { errors: fieldErrors(parsed.error), message: 'Check the highlighted fields.' };

  const input = parsed.data;
  const { phone } = normalizePhone(input.phone);

  let created: { id: string; reference: string; fullName: string } | null = null;
  for (let attempt = 0; attempt < 5 && !created; attempt += 1) {
    try {
      created = await prisma.$transaction(async (tx) => {
        const client = await tx.client.create({
          data: {
            reference: await nextReference(),
            fullName: toTitleCase(input.fullName),
            phone,
            countryOfBirth: normalizeCountry(input.countryOfBirth),
            expectedCommissionCents: input.potentialRevenue,
            status: 'PROSPECT',
            source: 'OTHER',
            ownerId: user.id,
          },
          select: { id: true, reference: true, fullName: true },
        });

        await tx.auditLog.create({
          data: auditRow({
            entity: 'Client',
            entityId: client.id,
            action: 'created',
            actor: user,
            summary: `${user.name} added ${client.fullName} (${client.reference}) to the sales board`,
          }),
        });

        return client;
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') continue;
      throw error;
    }
  }

  if (!created) return { message: 'Could not allocate a client reference. Try again.' };

  revalidatePath('/pipeline');
  revalidatePath('/clients');
  revalidatePath('/');
  return { ok: true, message: `${created.fullName} added to the board.` };
}

/**
 * Settles every unearned commission on a client. The card then leaves the
 * board, because paid commission is revenue rather than pipeline.
 */
export async function markCommissionPaidAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADVISOR');
  const clientId = String(formData.get('clientId') ?? '');
  if (!clientId) return;

  const client = await prisma.client.findUnique({
    where: { id: clientId },
    select: {
      fullName: true,
      commissions: { where: { status: { not: 'PAID' } }, select: { id: true, amountCents: true } },
    },
  });
  if (!client || client.commissions.length === 0) return;

  const today = todayUtc();
  const total = client.commissions.reduce((sum, c) => sum + c.amountCents, 0);

  await prisma.$transaction(async (tx) => {
    for (const commission of client.commissions) {
      await tx.commission.update({
        where: { id: commission.id },
        data: {
          status: 'PAID',
          paymentReceivedDate: today,
          amountReceivedCents: commission.amountCents,
          paidDateUnknown: false,
        },
      });
    }

    await tx.auditLog.create({
      data: auditRow({
        entity: 'Commission',
        entityId: clientId,
        action: 'updated',
        field: 'status',
        newValue: 'PAID',
        actor: user,
        summary: `${user.name} marked ${formatCents(total)} of commission paid for ${client.fullName}`,
      }),
    });
  });

  revalidatePath('/pipeline');
  revalidatePath('/commissions');
  revalidatePath(`/clients/${clientId}`);
  revalidatePath('/');
}

/** Attorney is the field that matters once a deal reaches Engaged. */
export async function setAttorneyAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADVISOR');
  const clientId = String(formData.get('clientId') ?? '');
  const attorney = String(formData.get('attorney') ?? '').trim().slice(0, 160) || null;
  if (!clientId) return;

  const existing = await prisma.client.findUnique({
    where: { id: clientId },
    select: { fullName: true, attorney: true },
  });
  if (!existing || existing.attorney === attorney) return;

  await prisma.client.update({
    where: { id: clientId },
    data: { attorney, version: { increment: 1 } },
  });

  await recordAudit({
    entity: 'Client',
    entityId: clientId,
    action: 'updated',
    field: 'attorney',
    oldValue: existing.attorney,
    newValue: attorney,
    actor: user,
    summary: `${user.name} set the attorney on ${existing.fullName}`,
  });

  revalidatePath('/pipeline');
  revalidatePath(`/clients/${clientId}`);
}

/** Lets the board edit the expected revenue without opening the full form. */
export async function setExpectedRevenueAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADVISOR');
  const clientId = String(formData.get('clientId') ?? '');
  const raw = String(formData.get('potentialRevenue') ?? '').replace(/[$,\s]/g, '');
  if (!clientId) return;
  if (raw !== '' && !/^\d{1,9}(\.\d{1,2})?$/.test(raw)) return;

  const cents = raw === '' ? null : parseMoneyToCents(raw);
  const existing = await prisma.client.findUnique({
    where: { id: clientId },
    select: { fullName: true, expectedCommissionCents: true },
  });
  if (!existing || existing.expectedCommissionCents === cents) return;

  await prisma.client.update({
    where: { id: clientId },
    data: { expectedCommissionCents: cents, version: { increment: 1 } },
  });

  await recordAudit({
    entity: 'Client',
    entityId: clientId,
    action: 'updated',
    field: 'expectedCommissionCents',
    oldValue: existing.expectedCommissionCents === null ? null : String(existing.expectedCommissionCents),
    newValue: cents === null ? null : String(cents),
    actor: user,
    summary: `${user.name} set the potential revenue on ${existing.fullName} to ${formatCents(cents)}`,
  });

  revalidatePath('/pipeline');
  revalidatePath(`/clients/${clientId}`);
}
