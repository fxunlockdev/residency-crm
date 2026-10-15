/**
 * Maps a row of the legacy "ZOHO FINAL" export onto the CRM data model.
 *
 * Pure and dependency-free so the mapping can be unit tested without a database.
 * Every legacy column is either mapped to a spec field or preserved verbatim on the
 * client record — nothing from the export is dropped.
 */
import type { ClientStatus, CommissionStatus, CommissionTrigger, LeadSource } from '@prisma/client';
import { parseUkDate } from '../dates';
import { parseMoneyToCents } from '../money';
import {
  buildFullName,
  cleanText,
  normalizeCountry,
  normalizeEmail,
  normalizePhone,
  normalizeProperNoun,
  parseBoolean,
  toTitleCase,
} from '../normalize';

export const ZOHO_COLUMNS = [
  'Contact Type',
  'First Name',
  'Last Name',
  'Email',
  'Phone',
  'Secondary Email',
  'Business',
  'Spouse / Parent',
  'Source',
  'Country of Birth',
  'Investor Status',
  'EB-5 Project',
  'Res Invest Fee (US $)',
  'Admin Fee Paid (US $)',
  'Interest Received?',
  'Interest Per Annum (%)',
  'Fee Paid to PM (US $)',
  'Funding Payment Date',
  'Filing Payment Date',
  'Date of i526 Approval',
  'Date of i526 Submission',
  'Lawyer',
  'Regional Centre',
  'Case Worker',
  'Interest to Galerie?',
  'Notes',
  'Programme',
] as const;

export type ZohoRow = Partial<Record<(typeof ZOHO_COLUMNS)[number], string>>;

/** Legacy "Source" values that are channels rather than the name of a referrer. */
const CHANNEL_SOURCES: Record<string, LeadSource> = {
  adwords: 'GOOGLE_ADS',
  'google ads': 'GOOGLE_ADS',
  googleads: 'GOOGLE_ADS',
  usif: 'PARTNER',
  behring: 'PARTNER',
  'eb-5 capital': 'PARTNER',
  'res inv': 'WEBSITE',
  'residency invest': 'WEBSITE',
  website: 'WEBSITE',
  linkedin: 'LINKEDIN',
  event: 'EVENT',
};

const LEGACY_STATUS: Record<string, ClientStatus> = {
  'i-526 approved': 'I526E_APPROVED',
  'i-526e approved': 'I526E_APPROVED',
  'i-526 filed': 'I526E_FILED',
  'i-526e filed': 'I526E_FILED',
  'i-829 filed': 'I829_FILED',
  'i-829 approved': 'I829_APPROVED',
  funded: 'FUNDED',
  engaged: 'ENGAGED',
  prospect: 'PROSPECT',
  lost: 'LOST',
};

export type MappedCommission = {
  trigger: CommissionTrigger;
  status: CommissionStatus;
  amountCents: number;
  amountReceivedCents: number | null;
  paymentReceivedDate: Date | null;
  paidDateUnknown: boolean;
  notes: string | null;
};

export type MappedClient = {
  fullName: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  secondaryEmail: string | null;
  phone: string | null;
  countryOfBirth: string | null;
  countryOfResidence: string | null;
  source: LeadSource;
  sourceRaw: string | null;
  referredByName: string | null;
  status: ClientStatus;
  attorney: string | null;
  caseWorker: string | null;
  regionalCentreName: string | null;
  projectName: string | null;
  i526eFiledDate: Date | null;
  i526eApprovedDate: Date | null;
  notes: string | null;
  legacyContactType: string | null;
  legacyBusiness: string | null;
  legacyProgramme: string | null;
  legacyInvestorStatus: string | null;
  spouseOrParent: string | null;
  adminFeeCents: number | null;
  pmFeeCents: number | null;
  interestReceived: boolean | null;
  interestRatePct: number | null;
  interestToGalerie: boolean | null;
  marketingConsent: boolean;
};

export type MappedRecord = {
  client: MappedClient;
  commissions: MappedCommission[];
  warnings: string[];
};

export type MapOptions = {
  /**
   * The export records a single "Res Invest Fee" alongside separate funding and filing
   * payment dates, i.e. a staged fee. When both dates are present the fee is split
   * evenly across the two instalments so the client total still reconciles.
   */
  splitStagedFee?: boolean;
};

export function mapZohoRow(row: ZohoRow, options: MapOptions = {}): MappedRecord {
  const splitStagedFee = options.splitStagedFee ?? true;
  const warnings: string[] = [];

  const firstName = toTitleCase(row['First Name']) || null;
  const lastName = toTitleCase(row['Last Name']) || null;
  const fullName = buildFullName(row['First Name'], row['Last Name']);
  if (!fullName) warnings.push('Row has no usable name');

  const rawEmail = cleanText(row['Email']);
  const email = normalizeEmail(rawEmail);
  if (rawEmail && !email) warnings.push(`Unusable email discarded: ${rawEmail}`);

  const { phone, extra } = normalizePhone(row['Phone']);
  if (extra) warnings.push(`Additional phone numbers kept in notes: ${extra}`);

  const { source, sourceRaw, referredByName } = mapSource(row['Source']);
  const status = mapStatus(row['Investor Status']);
  if (!status.matched) warnings.push(`Unknown investor status "${row['Investor Status'] ?? ''}" — imported as Prospect`);

  const i526eFiledDate = parseUkDate(row['Date of i526 Submission']);
  const i526eApprovedDate = parseUkDate(row['Date of i526 Approval']);
  if (row['Date of i526 Submission'] && !i526eFiledDate) {
    warnings.push(`Unparseable filing date "${row['Date of i526 Submission']}"`);
  }
  if (row['Date of i526 Approval'] && !i526eApprovedDate) {
    warnings.push(`Unparseable approval date "${row['Date of i526 Approval']}"`);
  }
  if (status.value === 'I526E_APPROVED' && !i526eApprovedDate) {
    warnings.push('Marked I-526 approved but no approval date in the export');
  }

  const notesParts = [cleanText(row['Notes'])];
  if (extra) notesParts.push(`Additional phone: ${extra}`);
  const notes = notesParts.filter(Boolean).join('\n\n') || null;

  const client: MappedClient = {
    fullName,
    firstName,
    lastName,
    email,
    secondaryEmail: normalizeEmail(row['Secondary Email']),
    phone,
    countryOfBirth: normalizeCountry(row['Country of Birth']),
    countryOfResidence: null,
    source,
    sourceRaw,
    referredByName,
    status: status.value,
    attorney: normalizeProperNoun(row['Lawyer']),
    caseWorker: normalizeProperNoun(row['Case Worker']),
    regionalCentreName: normalizeProperNoun(row['Regional Centre']),
    projectName: cleanText(row['EB-5 Project']),
    i526eFiledDate,
    i526eApprovedDate,
    notes,
    legacyContactType: cleanText(row['Contact Type']),
    legacyBusiness: cleanText(row['Business']),
    legacyProgramme: cleanText(row['Programme']),
    legacyInvestorStatus: cleanText(row['Investor Status']),
    spouseOrParent: cleanText(row['Spouse / Parent']),
    adminFeeCents: parseMoneyToCents(row['Admin Fee Paid (US $)']),
    pmFeeCents: parseMoneyToCents(row['Fee Paid to PM (US $)']),
    interestReceived: parseBoolean(row['Interest Received?']),
    interestRatePct: parseInterestRate(row['Interest Per Annum (%)']),
    interestToGalerie: parseBoolean(row['Interest to Galerie?']),
    // Legacy records carry no recorded opt-in, so consent starts false by design.
    marketingConsent: false,
  };

  const commissions = mapCommissions(row, { splitStagedFee }, warnings);

  return { client, commissions, warnings };
}

function parseInterestRate(input: string | undefined): number | null {
  const cleaned = cleanText(input);
  if (!cleaned) return null;
  const value = Number(cleaned.replace('%', '').trim());
  return Number.isFinite(value) ? value : null;
}

export function mapSource(raw: string | undefined): {
  source: LeadSource;
  sourceRaw: string | null;
  referredByName: string | null;
} {
  const cleaned = cleanText(raw);
  if (!cleaned) return { source: 'OTHER', sourceRaw: null, referredByName: null };

  const channel = CHANNEL_SOURCES[cleaned.toLowerCase()];
  if (channel) return { source: channel, sourceRaw: cleaned, referredByName: null };

  // Anything else in this column is the name of the person who referred the client.
  return { source: 'REFERRAL', sourceRaw: cleaned, referredByName: toTitleCase(cleaned) };
}

export function mapStatus(raw: string | undefined): { value: ClientStatus; matched: boolean } {
  const cleaned = cleanText(raw);
  if (!cleaned) return { value: 'PROSPECT', matched: false };
  const match = LEGACY_STATUS[cleaned.toLowerCase()];
  return match ? { value: match, matched: true } : { value: 'PROSPECT', matched: false };
}

function mapCommissions(row: ZohoRow, options: Required<MapOptions>, warnings: string[]): MappedCommission[] {
  const feeCents = parseMoneyToCents(row['Res Invest Fee (US $)']);
  const fundingRaw = cleanText(row['Funding Payment Date']);
  const filingRaw = cleanText(row['Filing Payment Date']);

  const fundingDate = parseUkDate(fundingRaw);
  const filingDate = parseUkDate(filingRaw);
  const fundingPaidUnknownDate = !!fundingRaw && !fundingDate && parseBoolean(fundingRaw) === true;
  const filingPaidUnknownDate = !!filingRaw && !filingDate && parseBoolean(filingRaw) === true;

  const fundingPaid = !!fundingDate || fundingPaidUnknownDate;
  const filingPaid = !!filingDate || filingPaidUnknownDate;

  if (fundingRaw && !fundingDate && !fundingPaidUnknownDate) {
    warnings.push(`Unparseable funding payment date "${fundingRaw}"`);
  }
  if (filingRaw && !filingDate && !filingPaidUnknownDate) {
    warnings.push(`Unparseable filing payment date "${filingRaw}"`);
  }

  if (feeCents === null && !fundingPaid && !filingPaid) return [];

  if (feeCents === null) {
    warnings.push('Payment dates recorded without a Res Invest fee — amount left at zero for review');
  }

  const instalments: Array<{ trigger: CommissionTrigger; paid: boolean; date: Date | null; unknownDate: boolean }> = [];
  if (fundingPaid && filingPaid) {
    // Both tranches were settled, so the fee really was staged.
    instalments.push({ trigger: 'ON_FUNDING', paid: true, date: fundingDate, unknownDate: fundingPaidUnknownDate });
    instalments.push({ trigger: 'ON_I526E_FILING', paid: true, date: filingDate, unknownDate: filingPaidUnknownDate });
  } else if (fundingPaid) {
    // Only the funding tranche is recorded: the whole fee sits on it rather
    // than inventing a second, unpaid instalment for the other half.
    instalments.push({ trigger: 'ON_FUNDING', paid: true, date: fundingDate, unknownDate: fundingPaidUnknownDate });
  } else if (filingPaid) {
    instalments.push({ trigger: 'ON_I526E_FILING', paid: true, date: filingDate, unknownDate: filingPaidUnknownDate });
  } else {
    // Fee agreed but nothing paid yet.
    instalments.push({ trigger: 'ON_FUNDING', paid: false, date: null, unknownDate: false });
  }

  const shouldSplit = options.splitStagedFee && instalments.length > 1;
  const total = feeCents ?? 0;
  const amounts = shouldSplit ? splitEvenly(total, instalments.length) : [total];

  return instalments.map((instalment, index) => {
    const amountCents = shouldSplit ? (amounts[index] ?? 0) : index === 0 ? total : 0;
    return {
      trigger: instalment.trigger,
      status: instalment.paid ? ('PAID' as CommissionStatus) : ('DUE' as CommissionStatus),
      amountCents,
      amountReceivedCents: instalment.paid ? amountCents : null,
      paymentReceivedDate: instalment.date,
      paidDateUnknown: instalment.unknownDate,
      notes: instalment.unknownDate ? 'Legacy export recorded "PAID" without a date.' : null,
    };
  });
}

/** Split cents without losing a penny to rounding. */
export function splitEvenly(totalCents: number, parts: number): number[] {
  if (parts <= 0) return [];
  const base = Math.floor(totalCents / parts);
  const remainder = totalCents - base * parts;
  return Array.from({ length: parts }, (_v, index) => base + (index < remainder ? 1 : 0));
}
