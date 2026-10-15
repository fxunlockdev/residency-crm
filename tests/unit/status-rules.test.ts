import { describe, expect, it } from 'vitest';
import { backfillStatusDate, commissionTriggerFor, conversionTypeFor } from '@/lib/status-rules';

const today = new Date(Date.UTC(2026, 9, 15));

describe('backfillStatusDate', () => {
  it('fills the matching date when it is empty', () => {
    expect(backfillStatusDate('FUNDED', {}, today)).toEqual({ dateFunded: today });
    expect(backfillStatusDate('I526E_FILED', {}, today)).toEqual({ i526eFiledDate: today });
    expect(backfillStatusDate('I829_APPROVED', {}, today)).toEqual({ i829ApprovedDate: today });
    expect(backfillStatusDate('GREEN_CARD_CONDITIONAL', {}, today)).toEqual({ greenCardIssuedDate: today });
  });

  it('never overwrites a date that is already recorded', () => {
    const recorded = new Date(Date.UTC(2019, 1, 12));
    expect(backfillStatusDate('FUNDED', { dateFunded: recorded }, today)).toEqual({});
  });

  it('does nothing for statuses with no date of their own', () => {
    expect(backfillStatusDate('PROSPECT', {}, today)).toEqual({});
    expect(backfillStatusDate('ENGAGED', {}, today)).toEqual({});
    expect(backfillStatusDate('LOST', {}, today)).toEqual({});
  });
});

describe('commissionTriggerFor', () => {
  it('maps the three paying milestones', () => {
    expect(commissionTriggerFor('FUNDED')).toBe('ON_FUNDING');
    expect(commissionTriggerFor('I526E_FILED')).toBe('ON_I526E_FILING');
    expect(commissionTriggerFor('I526E_APPROVED')).toBe('ON_I526E_APPROVAL');
  });
  it('returns null elsewhere', () => {
    expect(commissionTriggerFor('PROSPECT')).toBeNull();
    expect(commissionTriggerFor('LOST')).toBeNull();
  });
});

describe('conversionTypeFor', () => {
  it('reports only the two optimisation signals', () => {
    expect(conversionTypeFor('ENGAGED')).toBe('ENGAGED');
    expect(conversionTypeFor('FUNDED')).toBe('FUNDED');
    expect(conversionTypeFor('I526E_FILED')).toBeNull();
    expect(conversionTypeFor('PROSPECT')).toBeNull();
  });
});
