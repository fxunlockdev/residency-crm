/**
 * Resolving the caller's IP behind a reverse proxy.
 *
 * X-Forwarded-For is client-writable: an attacker can prepend any value, so the
 * leftmost entry is never trustworthy. The usual answer is to take the
 * rightmost entry instead, but on Railway that is the edge's own internal hop,
 * and it rotates across a pool — measured in production, thirteen requests from
 * one machine landed on six different rightmost addresses, splitting the
 * per-IP bucket six ways.
 *
 * X-Real-IP is set by the proxy itself and overwrites anything the client sent,
 * so it is preferred where present. The rightmost XFF entry remains the
 * fallback for proxies that do not set it. Neither is a hard guarantee, which
 * is why callers also keep a global bucket that no header can influence.
 */
export function clientIpFrom(headers: Headers): string {
  const realIp = headers.get('x-real-ip')?.trim();
  if (realIp) return realIp;

  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const rightmost = parts[parts.length - 1];
    if (rightmost) return rightmost;
  }
  return 'unknown';
}

/** Constant-time string comparison for shared secrets. */
export function safeEqual(a: string | null | undefined, b: string | null | undefined): boolean {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) {
    // Still burn a comparison so length is not trivially observable by timing.
    let sink = 0;
    for (let i = 0; i < Math.max(a.length, b.length); i += 1) {
      sink |= (a.charCodeAt(i % (a.length || 1)) ^ b.charCodeAt(i % (b.length || 1))) || 0;
    }
    return false && sink === 0;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}
