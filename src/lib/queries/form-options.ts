import 'server-only';
import { prisma } from '@/lib/prisma';

export async function getClientFormOptions(excludeClientId?: string) {
  const [centres, projects, owners, referrers] = await Promise.all([
    prisma.regionalCentre.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.project.findMany({ where: { isActive: true }, orderBy: { name: 'asc' } }),
    prisma.user.findMany({ where: { isActive: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
    prisma.client.findMany({
      where: excludeClientId ? { id: { not: excludeClientId } } : undefined,
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, reference: true },
      take: 500,
    }),
  ]);

  return {
    centres: centres.map((c) => ({ value: c.id, label: c.name })),
    projects: projects.map((p) => ({ value: p.id, label: p.name })),
    owners: owners.map((u) => ({ value: u.id, label: u.name })),
    referrers: referrers.map((c) => ({ value: c.id, label: `${c.fullName} · ${c.reference}` })),
  };
}
