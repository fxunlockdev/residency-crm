'use server';

import { revalidatePath } from 'next/cache';
import type { DocumentKind } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthError, requireRoleOrThrow, requireRoleOrRedirect } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { removeUpload, storeUpload, UploadError } from '@/lib/storage';
import type { FormState } from './client-actions';

const KINDS: DocumentKind[] = ['I526E_RECEIPT', 'INVOICE', 'OTHER'];

export async function uploadDocumentAction(_previous: FormState, formData: FormData): Promise<FormState> {
  let user;
  try {
    user = await requireRoleOrThrow('ADVISOR');
  } catch (error) {
    return { message: error instanceof AuthError ? error.message : 'Something went wrong.' };
  }

  const clientId = String(formData.get('clientId') ?? '') || null;
  const commissionId = String(formData.get('commissionId') ?? '') || null;
  const kindInput = String(formData.get('kind') ?? 'OTHER') as DocumentKind;
  const kind = KINDS.includes(kindInput) ? kindInput : 'OTHER';
  const file = formData.get('file');

  if (!clientId && !commissionId) return { message: 'Attach the file to a client or a commission.' };
  if (!(file instanceof File)) return { message: 'Choose a file to upload.' };

  // Check the record exists before any bytes land on the volume, otherwise a
  // failed insert leaves an unreferenced file that no retention process finds.
  if (clientId && (await prisma.client.count({ where: { id: clientId } })) === 0) {
    return { message: 'That client no longer exists.' };
  }
  if (commissionId && (await prisma.commission.count({ where: { id: commissionId } })) === 0) {
    return { message: 'That commission no longer exists.' };
  }

  let storageKey: string | null = null;
  try {
    const stored = await storeUpload(file);
    storageKey = stored.storageKey;
    const document = await prisma.document.create({
      data: {
        kind,
        filename: file.name.slice(0, 200),
        storageKey: stored.storageKey,
        mimeType: stored.mimeType,
        sizeBytes: stored.sizeBytes,
        clientId,
        commissionId,
        uploadedById: user.id,
      },
      select: { id: true },
    });

    await recordAudit({
      entity: 'Document',
      entityId: document.id,
      action: 'uploaded',
      actor: user,
      summary: `${user.name} uploaded ${file.name}`,
    });
  } catch (error) {
    // Never leave the bytes behind when the row could not be written.
    if (storageKey) await removeUpload(storageKey);
    if (error instanceof UploadError) return { message: error.message };
    console.error('Document upload failed', error instanceof Error ? error.message : error);
    return { message: 'The file could not be saved. Try again.' };
  }

  if (clientId) revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: 'File uploaded.' };
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrRedirect('ADVISOR');
  const id = String(formData.get('documentId') ?? '');
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return;

  await prisma.document.delete({ where: { id } });
  await removeUpload(document.storageKey);
  await recordAudit({
    entity: 'Document',
    entityId: id,
    action: 'deleted',
    actor: user,
    summary: `${user.name} deleted ${document.filename}`,
  });

  if (document.clientId) revalidatePath(`/clients/${document.clientId}`);
}
