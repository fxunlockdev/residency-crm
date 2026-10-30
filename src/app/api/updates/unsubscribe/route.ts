import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { safeEqual } from '@/lib/client-ip';

export const dynamic = 'force-dynamic';

/**
 * Opting out of the EB-5 updates list.
 *
 * Called by the website, which owns the page a subscriber actually sees and
 * the URL that goes in every newsletter's List-Unsubscribe header. Mail
 * clients post to that website URL directly for one-click unsubscribe; the
 * website adds the shared token and forwards here.
 *
 * Says whether the token matched. Tokens are 192 bits of randomness behind a
 * unique index, so an honest answer is not an oracle anyone can use: there is
 * nothing to enumerate. Hiding it would be worse than useless, because a
 * truncated or mangled link would tell someone they had unsubscribed when
 * they had not, and they would keep receiving mail they asked to stop.
 */
async function unsubscribe(request: NextRequest): Promise<NextResponse> {
  const expectedToken = process.env.LEAD_INTAKE_TOKEN?.trim();
  if (!expectedToken) {
    console.error('Unsubscribe rejected: LEAD_INTAKE_TOKEN is not configured.');
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  }
  if (!safeEqual(request.headers.get('x-rf-token'), expectedToken)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }

  const token = await readToken(request);
  if (!token) return NextResponse.json({ error: 'Send a token.' }, { status: 400 });

  // updateMany, not update: an unknown token must not throw, and a second
  // click on the same link must not fail either.
  const changed = await prisma.updateSubscription.updateMany({
    where: { unsubscribeToken: token, unsubscribedAt: null },
    data: { unsubscribedAt: new Date(), consentEmail: false, consentWhatsapp: false },
  });

  if (changed.count > 0) return NextResponse.json({ ok: true, state: 'unsubscribed' });

  // Already unsubscribed is still success: clicking the link twice must not
  // look like a failure.
  const known = await prisma.updateSubscription.count({ where: { unsubscribeToken: token } });
  if (known > 0) return NextResponse.json({ ok: true, state: 'already' });

  return NextResponse.json({ ok: false, state: 'unknown' }, { status: 404 });
}

async function readToken(request: NextRequest): Promise<string | null> {
  const fromQuery = request.nextUrl.searchParams.get('token')?.trim();
  if (fromQuery) return fromQuery;

  const payload = (await request.json().catch(() => null)) as { token?: unknown } | null;
  const fromBody = typeof payload?.token === 'string' ? payload.token.trim() : '';
  return fromBody || null;
}

export async function POST(request: NextRequest) {
  return unsubscribe(request);
}
