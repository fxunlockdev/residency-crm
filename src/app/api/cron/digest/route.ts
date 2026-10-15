import { NextResponse, type NextRequest } from 'next/server';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { buildDigest, renderDigestText, sendDigestEmail } from '@/lib/digest';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorised = secret ? request.headers.get('authorization') === `Bearer ${secret}` : false;

  if (!authorised) {
    const user = await getCurrentUser();
    if (!user || !hasRole(user, 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  const digest = await buildDigest();
  const delivery = await sendDigestEmail(digest);

  return NextResponse.json({
    status: 'ok',
    emailed: delivery.sent,
    reason: delivery.reason,
    summary: {
      followUps: digest.followUps.length,
      commissionsDue: digest.commissionsDue.length,
      overdueInvoices: digest.overdueInvoices.length,
      notFiled: digest.deadlineCount,
    },
    text: renderDigestText(digest),
  });
}
