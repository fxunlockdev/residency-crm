import 'server-only';
import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';

/**
 * The EB-5 updates list: everyone who filled in the signup on the website.
 *
 * One row per person, with the channels they actually agreed to. A subscriber
 * may have given a WhatsApp number, an email address, or both, so the two
 * channels are counted and filtered separately rather than assumed together.
 */

export const CHANNELS = ['all', 'email', 'whatsapp'] as const;
export const STATUSES = ['active', 'unsubscribed', 'any'] as const;

export type Channel = (typeof CHANNELS)[number];
export type Status = (typeof STATUSES)[number];

export type SubscriberFilters = { channel: Channel; status: Status; q: string };

export const PAGE_SIZE = 50;

export function readFilters(params: Record<string, string | string[] | undefined>): SubscriberFilters {
  const one = (key: string) => {
    const value = params[key];
    return (Array.isArray(value) ? value[0] : value)?.trim() ?? '';
  };
  const channel = one('channel') as Channel;
  const status = one('status') as Status;

  return {
    channel: CHANNELS.includes(channel) ? channel : 'all',
    status: STATUSES.includes(status) ? status : 'active',
    q: one('q').slice(0, 120),
  };
}

export function subscriberWhere(filters: SubscriberFilters): Prisma.UpdateSubscriptionWhereInput {
  const and: Prisma.UpdateSubscriptionWhereInput[] = [];

  // Consent and a contact detail, both: a ticked box with no address is not a
  // reachable subscriber, and an address without the box is not consent.
  if (filters.channel === 'email') and.push({ consentEmail: true, email: { not: null } });
  if (filters.channel === 'whatsapp') and.push({ consentWhatsapp: true, phone: { not: null } });

  if (filters.status === 'active') and.push({ unsubscribedAt: null });
  if (filters.status === 'unsubscribed') and.push({ unsubscribedAt: { not: null } });

  if (filters.q) {
    and.push({
      OR: [
        { name: { contains: filters.q, mode: 'insensitive' } },
        { email: { contains: filters.q, mode: 'insensitive' } },
        { phone: { contains: filters.q } },
      ],
    });
  }

  return and.length > 0 ? { AND: and } : {};
}

const LIST_SELECT = {
  id: true,
  name: true,
  email: true,
  phone: true,
  consentEmail: true,
  consentWhatsapp: true,
  consentAt: true,
  signupType: true,
  sourcePath: true,
  unsubscribedAt: true,
  createdAt: true,
} satisfies Prisma.UpdateSubscriptionSelect;

export type SubscriberRow = Prisma.UpdateSubscriptionGetPayload<{ select: typeof LIST_SELECT }>;

export async function listSubscribers(filters: SubscriberFilters, page: number) {
  const where = subscriberWhere(filters);

  const [rows, total] = await Promise.all([
    prisma.updateSubscription.findMany({
      where,
      select: LIST_SELECT,
      orderBy: { createdAt: 'desc' },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
    prisma.updateSubscription.count({ where }),
  ]);

  return { rows, total, pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)) };
}

/** Everything matching the filter, for the export. No paging. */
export async function allSubscribers(filters: SubscriberFilters): Promise<SubscriberRow[]> {
  return prisma.updateSubscription.findMany({
    where: subscriberWhere(filters),
    select: LIST_SELECT,
    orderBy: { createdAt: 'desc' },
  });
}

export type SubscriberTotals = { email: number; whatsapp: number; both: number; unsubscribed: number };

export async function subscriberTotals(): Promise<SubscriberTotals> {
  const live = { unsubscribedAt: null };
  const reachableByEmail = { ...live, consentEmail: true, email: { not: null } } as const;
  const reachableByWhatsapp = { ...live, consentWhatsapp: true, phone: { not: null } } as const;

  const [email, whatsapp, both, unsubscribed] = await Promise.all([
    prisma.updateSubscription.count({ where: reachableByEmail }),
    prisma.updateSubscription.count({ where: reachableByWhatsapp }),
    prisma.updateSubscription.count({ where: { ...reachableByEmail, ...reachableByWhatsapp } }),
    prisma.updateSubscription.count({ where: { unsubscribedAt: { not: null } } }),
  ]);

  return { email, whatsapp, both, unsubscribed };
}
