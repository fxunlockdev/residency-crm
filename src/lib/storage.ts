import 'server-only';
import { randomUUID } from 'node:crypto';
import { mkdir, readFile, unlink, writeFile } from 'node:fs/promises';
import path from 'node:path';

/** 10 MB is ample for a USCIS receipt or an invoice PDF. */
export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/heic': 'heic',
};

export class UploadError extends Error {}

function uploadRoot(): string {
  return process.env.UPLOAD_DIR || path.join(process.cwd(), 'storage', 'uploads');
}

/**
 * Stores the file under a generated key. The original filename is kept in the database
 * for display only — it never touches the filesystem, so it cannot traverse paths.
 */
export async function storeUpload(file: File): Promise<{ storageKey: string; sizeBytes: number; mimeType: string }> {
  if (!file || file.size === 0) throw new UploadError('Choose a file to upload.');
  if (file.size > MAX_UPLOAD_BYTES) throw new UploadError('Files must be 10 MB or smaller.');

  const extension = ALLOWED_MIME_TYPES[file.type];
  if (!extension) throw new UploadError('Upload a PDF or an image (PNG, JPEG, WebP or HEIC).');

  const key = `${new Date().getUTCFullYear()}/${randomUUID()}.${extension}`;
  const destination = path.join(uploadRoot(), key);
  await mkdir(path.dirname(destination), { recursive: true });
  await writeFile(destination, Buffer.from(await file.arrayBuffer()), { mode: 0o600 });

  return { storageKey: key, sizeBytes: file.size, mimeType: file.type };
}

export async function readUpload(storageKey: string): Promise<Buffer> {
  const resolved = resolveKey(storageKey);
  return readFile(resolved);
}

export async function removeUpload(storageKey: string): Promise<void> {
  try {
    await unlink(resolveKey(storageKey));
  } catch {
    // A missing file should not block deleting the record.
  }
}

/** Guards against a storage key that tries to escape the upload directory. */
function resolveKey(storageKey: string): string {
  const root = path.resolve(uploadRoot());
  const resolved = path.resolve(root, storageKey);
  if (resolved !== root && !resolved.startsWith(root + path.sep)) {
    throw new UploadError('Invalid file reference.');
  }
  return resolved;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
