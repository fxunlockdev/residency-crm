import { describe, expect, it } from 'vitest';
import { buildClientWhere, RETROGRESSION_FILTER } from '@/lib/queries/clients';
import { ACTIVE_STATUSES } from '@/lib/pipeline';
import { RETROGRESSION_COUNTRIES } from '@/lib/labels';

describe('buildClientWhere', () => {
  it('hides lost clients unless they are asked for', () => {
    expect(buildClientWhere({}).AND).toEqual([{ status: { in: ACTIVE_STATUSES } }]);
    expect(buildClientWhere({ includeLost: true })).toEqual({});
  });

  it('lets an explicit status override the default', () => {
    expect(buildClientWhere({ status: 'LOST' }).AND).toEqual([{ status: 'LOST' }]);
  });

  it('ignores a status that is not a real stage instead of passing it to the driver', () => {
    // A crafted ?status= value used to reach Prisma and 500 the page.
    expect(buildClientWhere({ status: 'DROP TABLE' }).AND).toEqual([{ status: { in: ACTIVE_STATUSES } }]);
    expect(buildClientWhere({ source: 'NOT_A_SOURCE', includeLost: true })).toEqual({});
  });

  it('expands the retrogression sentinel into the country list', () => {
    const and = buildClientWhere({ country: RETROGRESSION_FILTER, includeLost: true }).AND as unknown[];
    expect(and).toContainEqual({ countryOfBirth: { in: [...RETROGRESSION_COUNTRIES] } });
  });

  it('searches every identifier someone might paste in', () => {
    const and = buildClientWhere({ q: 'RF-0145' }).AND as Array<{ OR?: unknown[] }>;
    expect(and[0]?.OR).toContainEqual({ reference: { contains: 'RF-0145', mode: 'insensitive' } });
  });
});
