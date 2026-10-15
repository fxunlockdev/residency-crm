import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { safeEqual } from '@/lib/client-ip';
import { isAdsConfigured, uploadConversions, type PendingConversion } from '@/lib/google-ads';

export const dynamic = 'force-dynamic';

const BATCH_SIZE = 100;
const MAX_ATTEMPTS = 5;

/**
 * Flushes queued offline conversions to Google Ads.
 * Call it from a Railway cron, or from the Settings page as an administrator.
 */
async function flush() {
  if (!isAdsConfigured()) {
    return NextResponse.json({ status: 'skipped', reason: 'Google Ads is not configured.' });
  }

  const queued = await prisma.conversionEvent.findMany({
    where: { status: { in: ['PENDING', 'FAILED'] }, gclid: { not: null }, attempts: { lt: MAX_ATTEMPTS } },
    orderBy: { occurredAt: 'asc' },
    take: BATCH_SIZE,
  });

  if (queued.length === 0) return NextResponse.json({ status: 'ok', sent: 0, failed: 0, skipped: 0 });

  const events: PendingConversion[] = queued.map((event) => ({
    id: event.id,
    type: event.type,
    gclid: event.gclid as string,
    occurredAt: event.occurredAt,
    valueCents: event.valueCents,
  }));

  const outcomes = await uploadConversions(events);

  for (const outcome of outcomes) {
    await prisma.conversionEvent.update({
      where: { id: outcome.id },
      data: {
        status: outcome.status,
        attempts: { increment: 1 },
        lastError: outcome.error ?? null,
        sentAt: outcome.status === 'SENT' ? new Date() : null,
      },
    });
  }

  return NextResponse.json({
    status: 'ok',
    sent: outcomes.filter((o) => o.status === 'SENT').length,
    failed: outcomes.filter((o) => o.status === 'FAILED').length,
    skipped: outcomes.filter((o) => o.status === 'SKIPPED').length,
  });
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  const authorised = secret ? safeEqual(request.headers.get('authorization'), `Bearer ${secret}`) : false;

  if (!authorised) {
    const user = await getCurrentUser();
    if (!user || !hasRole(user, 'ADMIN')) {
      return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
    }
  }

  return flush();
}

export async function POST(request: NextRequest) {
  return GET(request);
}
