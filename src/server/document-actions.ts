'use server';

import { revalidatePath } from 'next/cache';
import type { DocumentKind } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { AuthError, requireRoleOrThrow } from '@/lib/auth';
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

  try {
    const stored = await storeUpload(file);
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
    if (error instanceof UploadError) return { message: error.message };
    throw error;
  }

  if (clientId) revalidatePath(`/clients/${clientId}`);
  return { ok: true, message: 'File uploaded.' };
}

export async function deleteDocumentAction(formData: FormData): Promise<void> {
  const user = await requireRoleOrThrow('ADVISOR');
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
