import 'server-only';
import type { ClientStatus, LeadSource, Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { ACTIVE_STATUSES } from '@/lib/pipeline';

export const PAGE_SIZE = 25;

export type ClientFilters = {
  q?: string;
  status?: string;
  source?: string;
  centre?: string;
  project?: string;
  country?: string;
  includeLost?: boolean;
  sort?: string;
  page?: number;
};

const SORTS: Record<string, Prisma.ClientOrderByWithRelationInput[]> = {
  name: [{ lastName: 'asc' }, { fullName: 'asc' }],
  recent: [{ updatedAt: 'desc' }],
  created: [{ createdAt: 'desc' }],
  followUp: [{ followUpDate: { sort: 'asc', nulls: 'last' } }],
  stage: [{ status: 'asc' }, { fullName: 'asc' }],
  reference: [{ reference: 'asc' }],
};

export function buildClientWhere(filters: ClientFilters): Prisma.ClientWhereInput {
  const where: Prisma.ClientWhereInput = {};
  const and: Prisma.ClientWhereInput[] = [];

  if (filters.q) {
    const q = filters.q.trim();
    and.push({
      OR: [
        { fullName: { contains: q, mode: 'insensitive' } },
        { email: { contains: q, mode: 'insensitive' } },
        { secondaryEmail: { contains: q, mode: 'insensitive' } },
        { reference: { contains: q, mode: 'insensitive' } },
        { phone: { contains: q, mode: 'insensitive' } },
        { i526eReceiptNumber: { contains: q, mode: 'insensitive' } },
        { attorney: { contains: q, mode: 'insensitive' } },
        { spouseOrParent: { contains: q, mode: 'insensitive' } },
      ],
    });
  }

  if (filters.status) {
    and.push({ status: filters.status as ClientStatus });
  } else if (!filters.includeLost) {
    and.push({ status: { in: ACTIVE_STATUSES } });
  }

  if (filters.source) and.push({ source: filters.source as LeadSource });
  if (filters.centre) and.push({ regionalCentreId: filters.centre });
  if (filters.project) and.push({ projectId: filters.project });
  if (filters.country) and.push({ countryOfBirth: filters.country });

  if (and.length) where.AND = and;
  return where;
}

export async function listClients(filters: ClientFilters) {
  const page = Math.max(1, filters.page ?? 1);
  const where = buildClientWhere(filters);
  const orderBy = SORTS[filters.sort ?? 'name'] ?? SORTS.name;

  const [rows, total] = await Promise.all([
    prisma.client.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        reference: true,
        fullName: true,
        email: true,
        phone: true,
        countryOfBirth: true,
        status: true,
        source: true,
        followUpDate: true,
        nextAction: true,
        i526eFiledDate: true,
        investmentAmountCents: true,
        regionalCentre: { select: { name: true } },
        project: { select: { name: true } },
        _count: { select: { meetings: true } },
        commissions: { select: { amountCents: true, status: true } },
      },
    }),
    prisma.client.count({ where }),
  ]);

  return {
    rows,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / PAGE_SIZE)),
  };
}

/** Values used to populate the filter dropdowns, derived from the data itself. */
export async function getFilterOptions() {
  const [centres, projects, countries] = await Promise.all([
    prisma.regionalCentre.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.project.findMany({ orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.client.groupBy({
      by: ['countryOfBirth'],
      where: { countryOfBirth: { not: null } },
      _count: { _all: true },
      orderBy: { _count: { countryOfBirth: 'desc' } },
    }),
  ]);

  return {
    centres,
    projects,
    countries: countries
      .map((row) => ({ name: row.countryOfBirth as string, count: row._count._all }))
      .filter((row) => !!row.name),
  };
}

export async function getClientDetail(id: string) {
  return prisma.client.findUnique({
    where: { id },
    include: {
      regionalCentre: true,
      project: true,
      owner: { select: { id: true, name: true } },
      referredBy: { select: { id: true, fullName: true, reference: true } },
      referrals: { select: { id: true, fullName: true, reference: true, status: true }, orderBy: { fullName: 'asc' } },
      meetings: { orderBy: { occurredAt: 'desc' }, include: { createdBy: { select: { name: true } } } },
      commissions: { orderBy: [{ trigger: 'asc' }, { createdAt: 'asc' }], include: { documents: true } },
      documents: { orderBy: { createdAt: 'desc' }, include: { uploadedBy: { select: { name: true } } } },
      conversions: true,
    },
  });
}

export type ClientDetail = NonNullable<Awaited<ReturnType<typeof getClientDetail>>>;
