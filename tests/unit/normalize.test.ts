import { describe, expect, it } from 'vitest';
import {
  buildFullName,
  cleanText,
  formatReference,
  normalizeCountry,
  normalizeEmail,
  normalizePhone,
  normalizeProperNoun,
  parseBoolean,
  toTitleCase,
} from '@/lib/normalize';

describe('toTitleCase', () => {
  it('fixes the shouting surnames in the export', () => {
    expect(toTitleCase('EXAMPLEWALA')).toBe('Examplewala');
    expect(toTitleCase('SAMPLE SURNAME')).toBe('Sample Surname');
    expect(toTitleCase('DOUBLE BARRELLED')).toBe('Double Barrelled');
  });

  it('preserves real-world capitalisation', () => {
    expect(toTitleCase("o'connor")).toBe("O'Connor");
    expect(toTitleCase('mccallum')).toBe('McCallum');
    expect(toTitleCase('Wang-Hsuan')).toBe('Wang-Hsuan');
    expect(toTitleCase('Vijit (DJ)')).toBe('Vijit (DJ)');
  });

  it('trims the stray padding in the export', () => {
    expect(toTitleCase('  Padded  ')).toBe('Padded');
    expect(toTitleCase('')).toBe('');
  });
});

describe('normalizeEmail', () => {
  it('lowercases and trims', () => {
    expect(normalizeEmail(' Mixed.Case@Example.COM ')).toBe('mixed.case@example.com');
  });
  it('rejects invalid addresses', () => {
    expect(normalizeEmail('not-an-email')).toBeNull();
    expect(normalizeEmail('')).toBeNull();
  });
});

describe('normalizePhone', () => {
  it('keeps the first number and preserves the rest', () => {
    const result = normalizePhone('+65 96 835 750 +65 63 367 725');
    expect(result.phone).toBe('+65 96 835 750');
    expect(result.extra).toBe('+65 63 367 725');
  });

  it('strips the smart-quote prefix found in the export', () => {
    expect(normalizePhone('‘+971 50 650 3942').phone).toBe('+971 50 650 3942');
  });

  it('handles single numbers and blanks', () => {
    expect(normalizePhone('+44 7700 900123')).toEqual({ phone: '+44 7700 900123', extra: null });
    expect(normalizePhone('')).toEqual({ phone: null, extra: null });
  });
});

describe('normalizeCountry', () => {
  it('expands the abbreviations used in the export', () => {
    expect(normalizeCountry('UK')).toBe('United Kingdom');
    expect(normalizeCountry('HK')).toBe('Hong Kong');
    expect(normalizeCountry('Dubai')).toBe('United Arab Emirates');
  });
  it('leaves full names alone', () => {
    expect(normalizeCountry('India')).toBe('India');
    expect(normalizeCountry('')).toBeNull();
  });
});

describe('normalizeProperNoun', () => {
  it('collapses the regional centre spellings', () => {
    expect(normalizeProperNoun('Eb-5 Capital')).toBe('EB-5 Capital');
    expect(normalizeProperNoun('EB-5 Capital')).toBe('EB-5 Capital');
    expect(normalizeProperNoun('USIF')).toBe('USIF');
  });
  it('fixes lowercase first names', () => {
    expect(normalizeProperNoun('alex Example')).toBe('Alex Example');
    expect(normalizeProperNoun('dana Sample')).toBe('Dana Sample');
    expect(normalizeProperNoun('ben Case')).toBe('Ben Case');
  });
  it('treats NONE as empty', () => {
    expect(normalizeProperNoun('NONE')).toBeNull();
  });
});

describe('parseBoolean', () => {
  it('reads the export booleans', () => {
    expect(parseBoolean('TRUE')).toBe(true);
    expect(parseBoolean('FALSE')).toBe(false);
    expect(parseBoolean('PAID')).toBe(true);
    expect(parseBoolean('')).toBeNull();
  });
});

describe('cleanText', () => {
  it('removes replacement characters and normalises punctuation', () => {
    expect(cleanText('isn�t')).toBe('isnt');
    expect(cleanText('he’s here')).toBe("he's here");
    expect(cleanText('   ')).toBeNull();
  });
});

describe('buildFullName / formatReference', () => {
  it('builds a display name', () => {
    expect(buildFullName(' Padded ', 'SURNAME')).toBe('Padded Surname');
    expect(buildFullName('Trailing ', 'SPACE')).toBe('Trailing Space');
  });
  it('pads references', () => {
    expect(formatReference(1)).toBe('RF-0001');
    expect(formatReference(145)).toBe('RF-0145');
  });
});
