import { describe, expect, it } from 'vitest';
import { isSupersededByPasswordChange } from '@/lib/session-token';

const at = (iso: string) => new Date(iso);

describe('isSupersededByPasswordChange', () => {
  it('keeps a token issued after the last password change', () => {
    expect(
      isSupersededByPasswordChange(at('2026-10-15T12:00:00Z'), at('2026-10-15T09:00:00Z')),
    ).toBe(false);
  });

  it('rejects a token issued before the password was reset', () => {
    // The whole point: an attacker holding a cookie must lose it the moment an
    // administrator resets that account's password.
    expect(
      isSupersededByPasswordChange(at('2026-10-15T09:00:00Z'), at('2026-10-15T12:00:00Z')),
    ).toBe(true);
  });

  it('tolerates the one-second resolution of the issued-at claim', () => {
    // The sign-in that sets a new password issues its token in the same second.
    expect(
      isSupersededByPasswordChange(at('2026-10-15T12:00:00Z'), at('2026-10-15T12:00:00.800Z')),
    ).toBe(false);
    expect(
      isSupersededByPasswordChange(at('2026-10-15T12:00:00Z'), at('2026-10-15T12:00:02Z')),
    ).toBe(true);
  });

  it('rejects a token with no issue time rather than trusting it', () => {
    expect(isSupersededByPasswordChange(null, at('2026-10-15T12:00:00Z'))).toBe(true);
  });

  it('allows everything when the account has never changed its password', () => {
    expect(isSupersededByPasswordChange(at('2026-10-15T12:00:00Z'), null)).toBe(false);
    expect(isSupersededByPasswordChange(null, undefined)).toBe(false);
  });
});
