import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { recordAudit } from '@/lib/audit';
import { allSubscribers, readFilters } from '@/lib/queries/subscribers';
import { csvDocument } from '@/lib/csv';

export const dynamic = 'force-dynamic';

const HEADER = [
  'Name',
  'Email',
  'WhatsApp',
  'Email consent',
  'WhatsApp consent',
  'Consent given',
  'Signup',
  'Signed up on page',
  'Unsubscribed',
];

/**
 * The filtered list as a spreadsheet.
 *
 * This is every person who asked to hear from us, in one file, so it needs a
 * higher bar than the page it sits on. A Viewer can read the list a page at a
 * time, as they can read every client record; taking the whole marketing list
 * away in one click is an act, not a read. Until the CRM sends WhatsApp
 * itself, this is how a WhatsApp broadcast gets its recipients.
 */
export async function GET(request: NextRequest) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  if (!hasRole(user, 'ADVISOR')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const filters = readFilters(Object.fromEntries(request.nextUrl.searchParams.entries()));
  const rows = await allSubscribers(filters);

  const csv = csvDocument(
    HEADER,
    rows.map((row) => [
      row.name,
      row.email,
      row.phone,
      row.consentEmail ? 'yes' : 'no',
      row.consentWhatsapp ? 'yes' : 'no',
      row.consentAt.toISOString(),
      row.signupType,
      row.sourcePath,
      row.unsubscribedAt ? row.unsubscribedAt.toISOString() : '',
    ]),
  );

  await recordAudit({
    entity: 'UpdateSubscription',
    entityId: 'export',
    action: 'exported',
    actor: user,
    summary: `${user.name} exported ${rows.length} subscriber${rows.length === 1 ? '' : 's'} (${filters.channel}, ${
      filters.status
    })`,
  });

  const stamp = new Date().toISOString().slice(0, 10);
  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="eb5-updates-${filters.channel}-${stamp}.csv"`,
      'Cache-Control': 'no-store',
    },
  });
}
