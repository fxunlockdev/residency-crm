/**
 * Resolving the caller's IP behind Railway's proxy.
 *
 * X-Forwarded-For is a client-writable header: an attacker can prepend any value.
 * The entry appended by the *last* trusted proxy is the only one worth trusting, so
 * the rightmost entry is used, not the leftmost.
 */
export function clientIpFrom(headers: Headers): string {
  const forwarded = headers.get('x-forwarded-for');
  if (forwarded) {
    const parts = forwarded
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean);
    const rightmost = parts[parts.length - 1];
    if (rightmost) return rightmost;
  }
  return headers.get('x-real-ip')?.trim() || 'unknown';
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
