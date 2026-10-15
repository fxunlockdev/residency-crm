import 'server-only';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STATUSES, WON_STATUSES } from '@/lib/pipeline';

/** Gaps worth filling in the migrated data, so nothing silently stays blank. */
export async function getDataQuality() {
  const [total, noEmail, noCountryOfBirth, noFilingDate, noInvestmentAmount, noDateFunded, approvedNoDate, unlinkedReferrals] =
    await Promise.all([
      prisma.client.count(),
      prisma.client.count({ where: { email: null } }),
      prisma.client.count({ where: { countryOfBirth: null } }),
      prisma.client.count({ where: { status: { in: ['I526E_FILED', 'I526E_APPROVED'] }, i526eFiledDate: null } }),
      prisma.client.count({ where: { status: { in: WON_STATUSES }, investmentAmountCents: null } }),
      prisma.client.count({ where: { status: { in: WON_STATUSES }, dateFunded: null } }),
      prisma.client.count({ where: { status: 'I526E_APPROVED', i526eApprovedDate: null } }),
      prisma.client.count({ where: { referredByName: { not: null }, referredById: null } }),
    ]);

  const zeroCommissions = await prisma.commission.count({ where: { amountCents: 0 } });
  const activeWithoutFollowUp = await prisma.client.count({
    where: { status: { in: ACTIVE_STATUSES }, followUpDate: null },
  });

  return {
    total,
    checks: [
      { label: 'No email address', count: noEmail, hint: 'Needed before any marketing or digest email.' },
      { label: 'No country of birth', count: noCountryOfBirth, hint: 'Determines visa chargeability.' },
      { label: 'Filed but no filing date', count: noFilingDate, hint: 'Blocks accurate deadline reporting.' },
      { label: 'Approved but no approval date', count: approvedNoDate, hint: 'Was blank in the legacy export.' },
      { label: 'Funded without an investment amount', count: noInvestmentAmount, hint: 'Not recorded in the legacy export.' },
      { label: 'Funded without a funding date', count: noDateFunded, hint: 'The export recorded fee payment dates, not funding dates.' },
      { label: 'Commission with no amount', count: zeroCommissions, hint: 'Payment dates existed without a fee figure.' },
      { label: 'Referrer is not a client record', count: unlinkedReferrals, hint: 'Kept as free text on the record.' },
      { label: 'Active client with no follow-up date', count: activeWithoutFollowUp, hint: 'These never surface in the follow-up queue.' },
    ],
  };
}
