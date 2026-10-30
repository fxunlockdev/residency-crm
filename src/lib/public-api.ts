import 'server-only';
import { NextResponse, type NextRequest } from 'next/server';
import { safeEqual } from './client-ip';

/**
 * The gate on the endpoints the public website calls.
 *
 * Article content is public once published, but the endpoint is not open:
 * the shared token keeps the CRM's reachable surface to the one caller that
 * should be hitting it, and stops the CRM being found by anyone crawling for
 * an unauthenticated JSON API.
 *
 * Fails closed. An unset token disables these routes rather than opening
 * them, which is how /api/leads and /api/updates already behave.
 */
export function denyUnlessTrusted(request: NextRequest): NextResponse | null {
  const expectedToken = process.env.LEAD_INTAKE_TOKEN?.trim();
  if (!expectedToken) {
    console.error('Public API rejected: LEAD_INTAKE_TOKEN is not configured.');
    return NextResponse.json({ error: 'Not configured.' }, { status: 503 });
  }
  if (!safeEqual(request.headers.get('x-rf-token'), expectedToken)) {
    return NextResponse.json({ error: 'Unauthorised' }, { status: 401 });
  }
  return null;
}
