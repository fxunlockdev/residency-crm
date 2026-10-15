import { describe, expect, it } from 'vitest';
import { mapSource, mapStatus, mapZohoRow, splitEvenly, type ZohoRow } from '@/lib/import/zoho-mapper';

/**
 * A fixture shaped exactly like a row of the export — same quirks (shouting surname,
 * shared family email, dd/mm/yyyy dates) — with invented people. Real client data is
 * never committed.
 */
const SAMPLE: ZohoRow = {
  'Contact Type': 'Client',
  'First Name': 'Arun',
  'Last Name': 'EXAMPLEWALA',
  Email: 'family@example.com',
  Business: 'Residency Invest',
  'Spouse / Parent': 'Priya Examplewala',
  'Country of Birth': 'India',
  'Investor Status': 'I-526 Approved',
  'EB-5 Project': '125 Greenwich',
  'Admin Fee Paid (US $)': '$39,950',
  'Interest Received?': 'TRUE',
  'Interest Per Annum (%)': '1',
  'Date of i526 Approval': '27/07/2018',
  'Date of i526 Submission': '27/04/2017',
  Lawyer: 'Alex Example',
  'Regional Centre': 'USIF',
  Programme: 'EB-5',
};

describe('mapZohoRow — identity and formatting', () => {
  it('normalises the name, status and dates', () => {
    const { client } = mapZohoRow(SAMPLE);
    expect(client.fullName).toBe('Arun Examplewala');
    expect(client.firstName).toBe('Arun');
    expect(client.lastName).toBe('Examplewala');
    expect(client.status).toBe('I526E_APPROVED');
    expect(client.i526eApprovedDate?.toISOString()).toBe('2018-07-27T00:00:00.000Z');
    expect(client.i526eFiledDate?.toISOString()).toBe('2017-04-27T00:00:00.000Z');
    expect(client.countryOfBirth).toBe('India');
  });

  it('preserves every legacy column', () => {
    const { client } = mapZohoRow(SAMPLE);
    expect(client.legacyContactType).toBe('Client');
    expect(client.legacyBusiness).toBe('Residency Invest');
    expect(client.legacyProgramme).toBe('EB-5');
    expect(client.legacyInvestorStatus).toBe('I-526 Approved');
    expect(client.spouseOrParent).toBe('Priya Examplewala');
    expect(client.adminFeeCents).toBe(3_995_000);
    expect(client.interestReceived).toBe(true);
    expect(client.interestRatePct).toBe(1);
  });

  it('never imports marketing consent that was not recorded', () => {
    expect(mapZohoRow(SAMPLE).client.marketingConsent).toBe(false);
  });

  it('normalises regional centre spelling variants', () => {
    expect(mapZohoRow({ ...SAMPLE, 'Regional Centre': 'Eb-5 Capital' }).client.regionalCentreName).toBe('EB-5 Capital');
    expect(mapZohoRow({ ...SAMPLE, Lawyer: 'alex Example' }).client.attorney).toBe('Alex Example');
  });
});

describe('mapSource', () => {
  it('maps marketing channels', () => {
    expect(mapSource('Adwords').source).toBe('GOOGLE_ADS');
    expect(mapSource('USIF').source).toBe('PARTNER');
    expect(mapSource('usif').source).toBe('PARTNER');
    expect(mapSource('Res Inv').source).toBe('WEBSITE');
    expect(mapSource('res Inv').source).toBe('WEBSITE');
  });

  it('treats a person name as a referral and keeps the referrer', () => {
    const result = mapSource('Priya Examplewala');
    expect(result.source).toBe('REFERRAL');
    expect(result.referredByName).toBe('Priya Examplewala');
    expect(result.sourceRaw).toBe('Priya Examplewala');
  });

  it('falls back to Other when blank', () => {
    expect(mapSource('').source).toBe('OTHER');
    expect(mapSource(undefined).referredByName).toBeNull();
  });

  it('keeps the original string for audit', () => {
    expect(mapSource('Rohit EXAMPLENAME').sourceRaw).toBe('Rohit EXAMPLENAME');
  });
});

describe('mapStatus', () => {
  it('maps the two legacy statuses', () => {
    expect(mapStatus('I-526 Filed')).toEqual({ value: 'I526E_FILED', matched: true });
    expect(mapStatus('I-526 Approved')).toEqual({ value: 'I526E_APPROVED', matched: true });
  });
  it('flags anything unknown instead of guessing', () => {
    expect(mapStatus('Something else')).toEqual({ value: 'PROSPECT', matched: false });
  });
});

describe('mapZohoRow — commissions', () => {
  const staged: ZohoRow = {
    ...SAMPLE,
    'Res Invest Fee (US $)': '$40,000',
    'Funding Payment Date': '07/12/2019',
    'Filing Payment Date': '07/12/2019',
  };

  it('splits a staged fee across the two instalments without losing cents', () => {
    const { commissions } = mapZohoRow(staged);
    expect(commissions).toHaveLength(2);
    expect(commissions.map((c) => c.trigger)).toEqual(['ON_FUNDING', 'ON_I526E_FILING']);
    expect(commissions[0]!.amountCents + commissions[1]!.amountCents).toBe(4_000_000);
    expect(commissions.every((c) => c.status === 'PAID')).toBe(true);
  });

  it('keeps the total intact for odd amounts', () => {
    const { commissions } = mapZohoRow({ ...staged, 'Res Invest Fee (US $)': '$23,750.01' });
    expect(commissions[0]!.amountCents + commissions[1]!.amountCents).toBe(2_375_001);
  });

  it('records the whole fee as Due when nothing has been paid', () => {
    const { commissions } = mapZohoRow({
      ...SAMPLE,
      'Res Invest Fee (US $)': '$30,000',
      'Funding Payment Date': '',
      'Filing Payment Date': '',
    });
    expect(commissions).toHaveLength(1);
    expect(commissions[0]!.status).toBe('DUE');
    expect(commissions[0]!.amountCents).toBe(3_000_000);
    expect(commissions[0]!.amountReceivedCents).toBeNull();
  });

  it('handles the literal PAID marker with no date', () => {
    const { commissions } = mapZohoRow({
      ...SAMPLE,
      'Res Invest Fee (US $)': '$20,000',
      'Funding Payment Date': 'PAID',
      'Filing Payment Date': 'PAID',
    });
    expect(commissions.every((c) => c.status === 'PAID')).toBe(true);
    expect(commissions.every((c) => c.paidDateUnknown)).toBe(true);
    expect(commissions[0]!.paymentReceivedDate).toBeNull();
  });

  it('creates nothing when there is no fee and no payment', () => {
    expect(mapZohoRow(SAMPLE).commissions).toHaveLength(0);
  });

  it('warns when payments exist without a recorded fee', () => {
    const { commissions, warnings } = mapZohoRow({
      ...SAMPLE,
      'Funding Payment Date': '12/02/2019',
      'Filing Payment Date': '12/02/2019',
    });
    expect(commissions.every((c) => c.amountCents === 0)).toBe(true);
    expect(warnings.join(' ')).toContain('without a Res Invest fee');
  });

  it('can keep the fee whole when splitting is disabled', () => {
    const { commissions } = mapZohoRow(staged, { splitStagedFee: false });
    expect(commissions[0]!.amountCents).toBe(4_000_000);
    expect(commissions[1]!.amountCents).toBe(0);
  });
});

describe('mapZohoRow — messy input', () => {
  it('keeps extra phone numbers instead of dropping them', () => {
    const { client, warnings } = mapZohoRow({
      ...SAMPLE,
      Phone: '+65 96 835 750 +65 63 367 725',
    });
    expect(client.phone).toBe('+65 96 835 750');
    expect(client.notes).toContain('+65 63 367 725');
    expect(warnings.join(' ')).toContain('Additional phone');
  });

  it('discards an unusable email loudly', () => {
    const { client, warnings } = mapZohoRow({ ...SAMPLE, Email: 'not-an-email' });
    expect(client.email).toBeNull();
    expect(warnings.join(' ')).toContain('Unusable email');
  });

  it('flags an approved case with no approval date', () => {
    const { warnings } = mapZohoRow({ ...SAMPLE, 'Date of i526 Approval': '' });
    expect(warnings.join(' ')).toContain('no approval date');
  });
});

describe('splitEvenly', () => {
  it('distributes the remainder one cent at a time', () => {
    expect(splitEvenly(101, 2)).toEqual([51, 50]);
    expect(splitEvenly(100, 3)).toEqual([34, 33, 33]);
    expect(splitEvenly(0, 2)).toEqual([0, 0]);
    expect(splitEvenly(10, 0)).toEqual([]);
  });
});
