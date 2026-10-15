import { describe, expect, it } from 'vitest';
import { clientIpFrom, safeEqual } from '@/lib/client-ip';

const headers = (values: Record<string, string>) => new Headers(values);

describe('clientIpFrom', () => {
  it('trusts the entry the proxy appended, not the one the client sent', () => {
    // An attacker prepends their own value; the real address is appended last.
    expect(clientIpFrom(headers({ 'x-forwarded-for': '1.1.1.1, 203.0.113.9' }))).toBe('203.0.113.9');
  });

  it('handles a single entry and stray whitespace', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': '  203.0.113.9  ' }))).toBe('203.0.113.9');
  });

  it('falls back to x-real-ip, then to a constant', () => {
    expect(clientIpFrom(headers({ 'x-real-ip': '198.51.100.4' }))).toBe('198.51.100.4');
    expect(clientIpFrom(headers({}))).toBe('unknown');
  });

  it('does not return an empty bucket key for a malformed header', () => {
    expect(clientIpFrom(headers({ 'x-forwarded-for': ' , , ' }))).toBe('unknown');
  });
});

describe('safeEqual', () => {
  it('matches identical secrets and rejects everything else', () => {
    expect(safeEqual('s3cret-token', 's3cret-token')).toBe(true);
    expect(safeEqual('s3cret-token', 's3cret-tokeX')).toBe(false);
    expect(safeEqual('short', 'a-much-longer-secret')).toBe(false);
    expect(safeEqual('', '')).toBe(true);
  });

  it('rejects absent values rather than treating them as equal', () => {
    expect(safeEqual(null, null)).toBe(false);
    expect(safeEqual(undefined, 'secret')).toBe(false);
    expect(safeEqual('secret', null)).toBe(false);
  });
});
