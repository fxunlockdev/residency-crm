import { describe, expect, it } from 'vitest';
import { safeRedirectTarget } from '@/lib/safe-redirect';

describe('safeRedirectTarget', () => {
  it('keeps a genuine in-app destination', () => {
    expect(safeRedirectTarget('/clients?status=FUNDED')).toBe('/clients?status=FUNDED');
    expect(safeRedirectTarget('/clients/abc123')).toBe('/clients/abc123');
  });

  it('refuses protocol-relative targets that leave the site', () => {
    expect(safeRedirectTarget('//evil.example')).toBe('/');
    expect(safeRedirectTarget('//evil.example/login')).toBe('/');
    expect(safeRedirectTarget('/\\evil.example')).toBe('/');
  });

  it('refuses absolute and scheme targets', () => {
    expect(safeRedirectTarget('https://evil.example')).toBe('/');
    expect(safeRedirectTarget('javascript:alert(1)')).toBe('/');
    expect(safeRedirectTarget('mailto:someone@example.com')).toBe('/');
  });

  it('refuses control characters used to smuggle a second header or scheme', () => {
    expect(safeRedirectTarget('/clients\nLocation: https://evil.example')).toBe('/');
    expect(safeRedirectTarget('/\u0000/evil')).toBe('/');
  });

  it('falls back for anything that is not a string', () => {
    expect(safeRedirectTarget(null)).toBe('/');
    expect(safeRedirectTarget(undefined)).toBe('/');
    expect(safeRedirectTarget('')).toBe('/');
  });
});
