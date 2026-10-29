import { randomInt } from 'node:crypto';

/**
 * Crockford base32 without I, L, O and U: nothing a person can misread when
 * they quote their reference back over the phone.
 */
const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';
const GROUP = 5;

/**
 * An opaque handle for a website enquiry.
 *
 * The CRM's own `reference` is sequential, so handing it to a visitor would
 * tell them how many clients exist. This is random instead: 50 bits, which
 * makes a collision vanishingly unlikely, and the unique index catches one
 * anyway.
 */
export function newPublicReference(): string {
  const pick = () =>
    Array.from({ length: GROUP }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');
  return `RF-${pick()}-${pick()}`;
}

const PATTERN = new RegExp(`^RF-[${ALPHABET}]{${GROUP}}-[${ALPHABET}]{${GROUP}}$`);

export function isPublicReference(value: string): boolean {
  return PATTERN.test(value);
}
