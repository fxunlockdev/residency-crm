import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { readUpload } from '@/lib/storage';

/**
 * Uploaded files are never publicly linkable: every request is authenticated and
 * the bytes are streamed from the private volume, never served as a static asset.
 *
 * Access is deliberately flat — any signed-in user may open any document. That
 * matches the rest of the CRM, where a read-only Viewer already sees every
 * client record, note and commission; narrowing documents alone would imply a
 * per-record model the app does not have. Revisit this before giving a Viewer
 * login to anyone outside the core team.
 */
export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });

  const { id } = await context.params;
  const document = await prisma.document.findUnique({ where: { id } });
  if (!document) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Buffer;
  try {
    body = await readUpload(document.storageKey);
  } catch {
    return NextResponse.json({ error: 'The stored file is no longer available.' }, { status: 410 });
  }

  return new NextResponse(new Uint8Array(body), {
    headers: {
      'Content-Type': document.mimeType,
      'Content-Length': String(body.byteLength),
      // attachment, not inline: the stored bytes are only validated by their
      // declared type, so they must never render on the CRM's own origin.
      'Content-Disposition': `attachment; filename="${encodeURIComponent(document.filename)}"`,
      'Cache-Control': 'private, no-store',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
