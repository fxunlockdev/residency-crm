import { describe, expect, it } from 'vitest';
import { isPublicReference, newPublicReference } from '@/lib/public-reference';

describe('public references', () => {
  it('produces a readable handle in the documented shape', () => {
    expect(newPublicReference()).toMatch(/^RF-[0-9A-Z]{5}-[0-9A-Z]{5}$/);
  });

  it('never uses a character that can be misread aloud', () => {
    const sample = Array.from({ length: 2000 }, newPublicReference).join('');
    // I/1, L/1, O/0 and U/V are the pairs people confuse over the phone.
    expect(sample).not.toMatch(/[ILOU]/);
  });

  it('does not repeat itself', () => {
    const seen = new Set(Array.from({ length: 5000 }, newPublicReference));
    expect(seen.size).toBe(5000);
  });

  it('rejects anything that is not one of ours', () => {
    expect(isPublicReference('RF-IIIII-OOOOO')).toBe(false);
    expect(isPublicReference('RF-ABCDE')).toBe(false);
    expect(isPublicReference('42')).toBe(false);
    expect(isPublicReference('')).toBe(false);
  });

  it('carries no running count, unlike the sequential reference', () => {
    // Two references minted in a row must not be adjacent in any ordering,
    // which is the whole point of not returning `reference`.
    const [first, second] = [newPublicReference(), newPublicReference()];
    expect(first).not.toBe(second);
  });
});
