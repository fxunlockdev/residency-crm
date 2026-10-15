import { describe, expect, it } from 'vitest';
import { clientSchema, commissionSchema, meetingSchema } from '@/lib/validation';

const base = { fullName: 'Ada Lovelace', source: 'WEBSITE', status: 'PROSPECT' };
const parse = (overrides: Record<string, unknown>) => clientSchema.safeParse({ ...base, ...overrides });

describe('clientSchema — money', () => {
  it('stores integer cents without float drift', () => {
    const result = parse({ investmentAmount: '$800,000.55' });
    expect(result.success && result.data.investmentAmount).toBe(80_000_055);
  });

  it('treats an untouched field as absent, not zero', () => {
    const result = parse({ investmentAmount: '' });
    expect(result.success && result.data.investmentAmount).toBeNull();
  });

  it('holds the documented range', () => {
    expect(parse({ investmentAmount: '20000000' }).success).toBe(true);
    expect(parse({ investmentAmount: '20000000.01' }).success).toBe(false);
    expect(parse({ investmentAmount: '-500' }).success).toBe(false);
  });

  it('rejects numeric shorthand that is almost certainly a typo', () => {
    // '1e5' would silently become $100,000 and '0x10' would become $16.
    expect(parse({ investmentAmount: '1e5' }).success).toBe(false);
    expect(parse({ investmentAmount: '0x10' }).success).toBe(false);
    expect(parse({ investmentAmount: 'Infinity' }).success).toBe(false);
  });

  it('rejects an ambiguous European-formatted amount rather than guessing', () => {
    expect(parse({ investmentAmount: '39.950,50' }).success).toBe(false);
  });
});

describe('clientSchema — dates and enums', () => {
  it('parses a form date at UTC midnight', () => {
    const result = parse({ i526eFiledDate: '2026-11-30' });
    expect(result.success && result.data.i526eFiledDate?.toISOString()).toBe('2026-11-30T00:00:00.000Z');
  });

  it('rejects other date formats and impossible dates', () => {
    expect(parse({ i526eFiledDate: '30/11/2026' }).success).toBe(false);
    expect(parse({ i526eFiledDate: '2026-13-45' }).success).toBe(false);
  });

  it('refuses a status or source outside the pipeline', () => {
    expect(parse({ status: 'HACKED' }).success).toBe(false);
    expect(parse({ source: 'ANYTHING' }).success).toBe(false);
  });

  it('normalises the email and drops unknown fields', () => {
    const result = parse({ email: '  Ada@Example.COM ', isAdmin: 'true' });
    expect(result.success && result.data.email).toBe('ada@example.com');
    expect(result.success && 'isAdmin' in result.data).toBe(false);
  });

  it('records consent only when the box was actually ticked', () => {
    expect(parse({ marketingConsent: 'on' }).success && parse({ marketingConsent: 'on' }).data?.marketingConsent).toBe(true);
    expect(parse({}).success && parse({}).data?.marketingConsent).toBe(false);
  });
});

describe('meetingSchema', () => {
  it('reads a datetime-local value as UTC, not as the server’s local time', () => {
    const result = meetingSchema.safeParse({
      clientId: 'c1',
      occurredAt: '2026-02-12T14:30',
      type: 'CALL',
    });
    expect(result.success && result.data.occurredAt.toISOString()).toBe('2026-02-12T14:30:00.000Z');
  });

  it('rejects a malformed timestamp', () => {
    expect(meetingSchema.safeParse({ clientId: 'c1', occurredAt: 'yesterday', type: 'CALL' }).success).toBe(false);
  });
});

describe('commissionSchema', () => {
  it('requires an amount, so a blanked box cannot silently write $0', () => {
    const blank = commissionSchema.safeParse({ clientId: 'c1', amount: '', trigger: 'ON_FUNDING', status: 'DUE' });
    expect(blank.success).toBe(false);
  });

  it('accepts a real amount', () => {
    const result = commissionSchema.safeParse({
      clientId: 'c1',
      amount: '40000',
      trigger: 'ON_FUNDING',
      status: 'DUE',
    });
    expect(result.success && result.data.amount).toBe(4_000_000);
  });
});
