import { describe, expect, it } from 'vitest';
import { readFilters, subscriberWhere } from '@/lib/queries/subscribers';
import { csvCell, csvDocument } from '@/lib/csv';

describe('readFilters', () => {
  it('defaults to every channel and only the people still subscribed', () => {
    expect(readFilters({})).toEqual({ channel: 'all', status: 'active', q: '' });
  });

  it('ignores a channel or status that is not one of ours', () => {
    expect(readFilters({ channel: 'sms', status: 'deleted' })).toEqual({
      channel: 'all',
      status: 'active',
      q: '',
    });
  });

  it('takes the first value when a parameter is repeated', () => {
    expect(readFilters({ channel: ['whatsapp', 'email'] }).channel).toBe('whatsapp');
  });

  it('caps the search text rather than passing an essay to the database', () => {
    expect(readFilters({ q: 'x'.repeat(500) }).q).toHaveLength(120);
  });
});

describe('subscriberWhere', () => {
  it('counts someone as reachable by email only with consent AND an address', () => {
    const where = subscriberWhere({ channel: 'email', status: 'active', q: '' });
    expect(where.AND).toContainEqual({ consentEmail: true, email: { not: null } });
  });

  it('does the same for WhatsApp, on the phone number', () => {
    const where = subscriberWhere({ channel: 'whatsapp', status: 'active', q: '' });
    expect(where.AND).toContainEqual({ consentWhatsapp: true, phone: { not: null } });
    // A WhatsApp-only subscriber has no email, so email consent must not be
    // part of this.
    expect(JSON.stringify(where)).not.toContain('consentEmail');
  });

  it('asks for everyone when the status filter says so', () => {
    const where = subscriberWhere({ channel: 'all', status: 'any', q: '' });
    expect(where).toEqual({});
  });

  it('separates the unsubscribed from the subscribed', () => {
    expect(subscriberWhere({ channel: 'all', status: 'active', q: '' }).AND).toContainEqual({
      unsubscribedAt: null,
    });
    expect(subscriberWhere({ channel: 'all', status: 'unsubscribed', q: '' }).AND).toContainEqual({
      unsubscribedAt: { not: null },
    });
  });

  it('searches the name, address and number, case-insensitively where it can', () => {
    const where = subscriberWhere({ channel: 'all', status: 'any', q: 'Priya' });
    expect(where.AND).toContainEqual({
      OR: [
        { name: { contains: 'Priya', mode: 'insensitive' } },
        { email: { contains: 'Priya', mode: 'insensitive' } },
        { phone: { contains: 'Priya' } },
      ],
    });
  });
});

describe('csv', () => {
  it('quotes every field, so a comma in a name does not become a column', () => {
    expect(csvCell('Rao, Priya')).toBe('"Rao, Priya"');
  });

  it('doubles an embedded quote rather than ending the field early', () => {
    expect(csvCell('He said "yes"')).toBe('"He said ""yes"""');
  });

  it('neutralises a field a spreadsheet would run as a formula', () => {
    expect(csvCell('=HYPERLINK("http://x","click")')).toBe('"\t=HYPERLINK(""http://x"",""click"")"');
    expect(csvCell('@SUM(A1)')).toBe('"\t@SUM(A1)"');
    expect(csvCell('-2+3')).toBe('"\t-2+3"');
    expect(csvCell('+cmd|calc')).toBe('"\t+cmd|calc"');
  });

  it('leaves a phone number intact, because the export feeds a broadcast tool', () => {
    // Almost every number starts with +, and a leading tab would break the
    // import this file exists for. Digits and punctuation cannot be a formula.
    expect(csvCell('+971585536498')).toBe('"+971585536498"');
    expect(csvCell('+44 203 637 0087')).toBe('"+44 203 637 0087"');
    // Still guarded when it is not actually a number.
    expect(csvCell('+971=SUM(A1)')).toBe('"\t+971=SUM(A1)"');
  });

  it('leaves an ordinary field alone', () => {
    expect(csvCell('priya@example.com')).toBe('"priya@example.com"');
  });

  it('writes an empty field for a missing value rather than the word null', () => {
    expect(csvCell(null)).toBe('""');
    expect(csvCell(undefined)).toBe('""');
  });

  it('separates rows with CRLF and ends the file with one', () => {
    const document = csvDocument(['A', 'B'], [['1', '2']]);
    expect(document).toBe('"A","B"\r\n"1","2"\r\n');
  });
});
