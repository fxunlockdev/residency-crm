import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, verifySessionToken } from '@/lib/session-token';

/** Public paths that must stay reachable without a session. */
const PUBLIC_PREFIXES = [
  '/login',
  '/api/leads',
  '/api/health',
  // Cron routes authenticate themselves with CRON_SECRET; without this the
  // middleware 401s the scheduler before the route ever runs.
  '/api/cron',
  '/rf-lead.js',
];

/**
 * Per-request nonce so the CSP can stay free of 'unsafe-inline' while Next's
 * own hydration scripts still run. Next reads the nonce from the CSP header it
 * sees on the request.
 */
function buildCsp(nonce: string): string {
  const isProduction = process.env.NODE_ENV === 'production';
  // Next's hot-reload runtime evaluates strings, so a dev build with no
  // 'unsafe-eval' loads no client JavaScript at all and nothing hydrates.
  // Production has no React Refresh and keeps the strict policy.
  const scriptSrc = isProduction
    ? `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'`
    : `script-src 'self' 'unsafe-eval' 'nonce-${nonce}' 'strict-dynamic'`;

  const bytes = [
    "default-src 'self'",
    scriptSrc,
    // Tailwind ships a stylesheet, but React still injects some inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    ...(isProduction ? ["connect-src 'self'"] : []),
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "frame-src 'none'",
  ];
  if (isProduction) bytes.push('upgrade-insecure-requests');
  // The dev server streams HMR updates over a websocket.
  if (!isProduction) bytes.push("connect-src 'self' ws: wss:");
  return bytes.join('; ');
}

function withCsp(response: NextResponse, csp: string): NextResponse {
  response.headers.set('Content-Security-Policy', csp);
  return response;
}

export async function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');
  const csp = buildCsp(nonce);
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);
  requestHeaders.set('Content-Security-Policy', csp);
  const pass = () => withCsp(NextResponse.next({ request: { headers: requestHeaders } }), csp);

  if (PUBLIC_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) {
    return pass();
  }

  const session = await verifySessionToken(request.cookies.get(SESSION_COOKIE)?.value);
  if (session) return pass();

  if (pathname.startsWith('/api/')) {
    return withCsp(NextResponse.json({ error: 'Unauthorised' }, { status: 401 }), csp);
  }

  const loginUrl = new URL('/login', request.url);
  if (pathname !== '/') loginUrl.searchParams.set('next', `${pathname}${search}`);
  return withCsp(NextResponse.redirect(loginUrl), csp);
}

export const config = {
  // Only the build's own asset prefixes are excluded. A blanket file-extension
  // suffix would let `/clients/<id>.png` skip authentication entirely.
  matcher: ['/((?!_next/static|_next/image|favicon\\.ico|icon\\.svg|apple-icon\\.svg|rf-lead\\.js).*)'],
};
