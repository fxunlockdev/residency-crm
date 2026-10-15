import 'server-only';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STATUSES, PRE_FILING_STATUSES } from '@/lib/pipeline';
import { FEE_INCREASE_DATE, daysUntil, formatDate, todayUtc } from '@/lib/dates';
import { formatCents } from '@/lib/money';

export type Digest = {
  date: string;
  followUps: Array<{ name: string; action: string | null; due: string }>;
  commissionsDue: Array<{ name: string; amount: string; centre: string }>;
  overdueInvoices: Array<{ name: string; amount: string; due: string }>;
  deadlineCount: number;
  daysToFeeIncrease: number | null;
};

export async function buildDigest(): Promise<Digest> {
  const today = todayUtc();
  const endOfToday = new Date(today.getTime() + 86_400_000 - 1);

  const [followUps, commissionsDue, overdue, deadlineCount] = await Promise.all([
    prisma.client.findMany({
      where: { status: { in: ACTIVE_STATUSES }, followUpDate: { not: null, lte: endOfToday } },
      orderBy: { followUpDate: 'asc' },
      select: { fullName: true, nextAction: true, followUpDate: true },
    }),
    prisma.commission.findMany({
      where: { status: 'DUE' },
      include: { client: { select: { fullName: true } }, regionalCentre: { select: { name: true } } },
    }),
    prisma.commission.findMany({
      where: { status: 'INVOICED', paymentDueDate: { lt: today } },
      include: { client: { select: { fullName: true } } },
      orderBy: { paymentDueDate: 'asc' },
    }),
    prisma.client.count({ where: { status: { in: PRE_FILING_STATUSES } } }),
  ]);

  return {
    date: formatDate(today),
    followUps: followUps.map((client) => ({
      name: client.fullName,
      action: client.nextAction,
      due: formatDate(client.followUpDate),
    })),
    commissionsDue: commissionsDue.map((commission) => ({
      name: commission.client.fullName,
      amount: formatCents(commission.amountCents),
      centre: commission.regionalCentre?.name ?? 'No regional centre',
    })),
    overdueInvoices: overdue.map((commission) => ({
      name: commission.client.fullName,
      amount: formatCents(commission.amountCents),
      due: formatDate(commission.paymentDueDate),
    })),
    deadlineCount,
    daysToFeeIncrease: daysUntil(FEE_INCREASE_DATE),
  };
}

export function renderDigestText(digest: Digest): string {
  const lines: string[] = [`Residency First — EB-5 tracker, ${digest.date}`, ''];

  lines.push(`Follow-ups due or overdue: ${digest.followUps.length}`);
  for (const item of digest.followUps.slice(0, 20)) {
    lines.push(`  · ${item.name} — ${item.action ?? 'no next action'} (${item.due})`);
  }

  lines.push('', `Commissions ready to invoice: ${digest.commissionsDue.length}`);
  for (const item of digest.commissionsDue.slice(0, 20)) {
    lines.push(`  · ${item.name} — ${item.amount} to ${item.centre}`);
  }

  lines.push('', `Invoices overdue: ${digest.overdueInvoices.length}`);
  for (const item of digest.overdueInvoices.slice(0, 20)) {
    lines.push(`  · ${item.name} — ${item.amount}, due ${item.due}`);
  }

  lines.push(
    '',
    `${digest.deadlineCount} client(s) have not filed an I-526E. ${
      digest.daysToFeeIncrease !== null && digest.daysToFeeIncrease >= 0
        ? `${digest.daysToFeeIncrease} days until the filing fee increase.`
        : 'The filing fee increase has passed.'
    }`,
  );

  return lines.join('\n');
}

export async function sendDigestEmail(digest: Digest): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.ALERT_EMAIL_TO;
  const from = process.env.ALERT_EMAIL_FROM ?? 'crm@residencyfirst.com';

  if (!apiKey || !to) return { sent: false, reason: 'RESEND_API_KEY or ALERT_EMAIL_TO is not set.' };

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      from,
      to: to.split(',').map((address) => address.trim()),
      subject: `EB-5 tracker — ${digest.followUps.length} follow-ups, ${digest.commissionsDue.length} to invoice`,
      text: renderDigestText(digest),
    }),
  });

  if (!response.ok) {
    return { sent: false, reason: `Resend returned ${response.status}.` };
  }
  return { sent: true };
}
