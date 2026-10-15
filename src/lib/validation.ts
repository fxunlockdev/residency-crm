import { z } from 'zod';
import { parseIsoDate, parseIsoDateTime } from './dates';
import { parseMoneyToCents } from './money';

/** FormData gives '' for untouched inputs and null for absent ones; both mean "no value". */
const optionalText = (max = 500) =>
  z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => {
      const trimmed = typeof value === 'string' ? value.trim() : '';
      return trimmed === '' ? null : trimmed;
    })
    .refine((value) => value === null || value.length <= max, { message: `Keep this under ${max} characters.` });

const optionalEmail = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === 'string' ? value.trim().toLowerCase() : ''))
  .refine((value) => value === '' || /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value), {
    message: 'Enter a valid email address.',
  })
  .transform((value) => (value === '' ? null : value));

const optionalDate = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === 'string' ? value.trim() : ''))
  .refine((value) => value === '' || parseIsoDate(value) !== null, { message: 'Enter a valid date.' })
  .transform((value) => (value === '' ? null : parseIsoDate(value)));

const optionalDateTime = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => (typeof value === 'string' ? value.trim() : ''))
  .refine((value) => value === '' || parseIsoDateTime(value) !== null, { message: 'Enter a valid date and time.' })
  .transform((value) => (value === '' ? null : parseIsoDateTime(value)));

const optionalMoney = z
  .union([z.string(), z.number(), z.null(), z.undefined()])
  .transform((value) => (typeof value === 'number' ? String(value) : typeof value === 'string' ? value.trim() : ''))
  .refine((value) => value === '' || /^-?\d{1,12}(\.\d{1,2})?$/.test(value.replace(/[$,\s]/g, '')), {
    message: 'Enter a plain amount, for example 800000 or 800000.50.',
  })
  .refine((value) => value === '' || parseMoneyToCents(value) !== null, { message: 'Enter an amount, for example 800000.' })
  .refine((value) => {
    const cents = parseMoneyToCents(value);
    return cents === null || (cents >= 0 && cents <= 2_000_000_000);
  }, { message: 'Amount is out of range.' })
  .transform((value) => (value === '' ? null : parseMoneyToCents(value)));

const checkbox = z
  .union([z.string(), z.null(), z.undefined()])
  .transform((value) => value === 'on' || value === 'true');

export const clientSchema = z.object({
  /** The version the edit form was rendered from; absent when creating. */
  version: z
    .union([z.string(), z.number(), z.null(), z.undefined()])
    .transform((value) => {
      const parsedValue = typeof value === 'number' ? value : Number(String(value ?? '').trim());
      return Number.isSafeInteger(parsedValue) && parsedValue >= 0 ? parsedValue : 0;
    }),
  fullName: z.string().trim().min(2, 'Enter the applicant’s full name.').max(160),
  email: optionalEmail,
  secondaryEmail: optionalEmail,
  phone: optionalText(80),
  countryOfResidence: optionalText(80),
  countryOfBirth: optionalText(80),

  source: z.enum(['GOOGLE_ADS', 'REFERRAL', 'WEBSITE', 'EVENT', 'PARTNER', 'LINKEDIN', 'OTHER']),
  referredById: optionalText(40),
  referredByName: optionalText(160),

  status: z.enum([
    'PROSPECT',
    'ENGAGED',
    'FUNDED',
    'I526E_FILED',
    'I526E_APPROVED',
    'GREEN_CARD_CONDITIONAL',
    'I829_FILED',
    'I829_APPROVED',
    'LOST',
  ]),
  attorney: optionalText(160),
  caseWorker: optionalText(160),
  regionalCentreId: optionalText(40),
  projectId: optionalText(40),
  investmentAmount: optionalMoney,

  dateFunded: optionalDate,
  i526eFiledDate: optionalDate,
  i526eReceiptNumber: optionalText(60),
  i526eApprovedDate: optionalDate,
  greenCardIssuedDate: optionalDate,
  i829FiledDate: optionalDate,
  i829ApprovedDate: optionalDate,

  nextAction: optionalText(240),
  followUpDate: optionalDate,
  marketingConsent: checkbox,
  notes: optionalText(8000),
  ownerId: optionalText(40),
});

export type ClientInput = z.infer<typeof clientSchema>;

export const meetingSchema = z.object({
  clientId: z.string().min(1),
  occurredAt: z
    .string()
    .trim()
    .min(1, 'Enter when the meeting happened.')
    .refine((value) => parseIsoDateTime(value) !== null, { message: 'Enter a valid date and time.' })
    .transform((value) => parseIsoDateTime(value) as Date),
  type: z.enum(['CALL', 'ZOOM', 'IN_PERSON', 'WHATSAPP']),
  attendees: optionalText(240),
  summary: optionalText(8000),
});

export const commissionSchema = z.object({
  clientId: z.string().min(1),
  // Required: an empty box used to write $0 over a real figure with no audit row.
  amount: optionalMoney.refine((cents) => cents !== null, { message: 'Enter the commission amount.' }),
  trigger: z.enum(['ON_FUNDING', 'ON_I526E_FILING', 'ON_I526E_APPROVAL', 'OTHER']),
  status: z.enum(['NOT_DUE', 'DUE', 'INVOICED', 'PAID', 'DISPUTED']),
  invoiceNumber: optionalText(60),
  invoiceSentDate: optionalDate,
  paymentDueDate: optionalDate,
  paymentReceivedDate: optionalDate,
  amountReceived: optionalMoney,
  notes: optionalText(2000),
});

export const userSchema = z.object({
  name: z.string().trim().min(2, 'Enter a name.').max(120),
  email: z.string().trim().toLowerCase().email('Enter a valid email address.'),
  role: z.enum(['ADMIN', 'ADVISOR', 'VIEWER']),
  password: z
    .union([z.string(), z.null(), z.undefined()])
    .transform((value) => (typeof value === 'string' ? value : ''))
    .refine((value) => value === '' || value.length >= 12, { message: 'Use at least 12 characters.' }),
});

export const leadIntakeSchema = z.object({
  fullName: z.string().trim().min(2).max(160),
  email: z.string().trim().toLowerCase().email().optional().or(z.literal('')),
  phone: z.string().trim().max(80).optional(),
  countryOfResidence: z.string().trim().max(80).optional(),
  countryOfBirth: z.string().trim().max(80).optional(),
  message: z.string().trim().max(4000).optional(),
  marketingConsent: z.boolean().optional(),
  gclid: z.string().trim().max(200).optional(),
  utmSource: z.string().trim().max(120).optional(),
  utmMedium: z.string().trim().max(120).optional(),
  utmCampaign: z.string().trim().max(160).optional(),
  keyword: z.string().trim().max(160).optional(),
  landingPage: z.string().trim().max(600).optional(),
});

/** Collapse a ZodError into { field: message } for rendering next to inputs. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const result: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join('.') || 'form';
    if (!result[key]) result[key] = issue.message;
  }
  return result;
}

export { optionalDateTime };
