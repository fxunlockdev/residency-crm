import 'server-only';
import { prisma } from '@/lib/prisma';

const REFERRER_LIMIT = 500;

/**
 * Options for the client form.
 *
 * `current` holds the values already on the record. A <select> whose value is
 * absent from its options silently falls back to the empty option, and saving
 * then writes null — so an inactive owner, or a referrer past the list cap,
 * would have its link quietly destroyed by an unrelated edit. Each current
 * value is therefore injected into its own list.
 */
export async function getClientFormOptions(
  excludeClientId?: string,
  current?: { ownerId?: string | null; referredById?: string | null; regionalCentreId?: string | null; projectId?: string | null },
) {
  const [centres, projects, owners, referrers] = await Promise.all([
    prisma.regionalCentre.findMany({
      where: { OR: [{ isActive: true }, ...(current?.regionalCentreId ? [{ id: current.regionalCentreId }] : [])] },
      orderBy: { name: 'asc' },
    }),
    prisma.project.findMany({
      where: { OR: [{ isActive: true }, ...(current?.projectId ? [{ id: current.projectId }] : [])] },
      orderBy: { name: 'asc' },
    }),
    prisma.user.findMany({
      where: { OR: [{ isActive: true }, ...(current?.ownerId ? [{ id: current.ownerId }] : [])] },
      orderBy: { name: 'asc' },
      select: { id: true, name: true, isActive: true },
    }),
    prisma.client.findMany({
      where: excludeClientId ? { id: { not: excludeClientId } } : undefined,
      orderBy: { fullName: 'asc' },
      select: { id: true, fullName: true, reference: true },
      take: REFERRER_LIMIT,
    }),
  ]);

  const referrerList = [...referrers];
  if (current?.referredById && !referrerList.some((c) => c.id === current.referredById)) {
    const missing = await prisma.client.findUnique({
      where: { id: current.referredById },
      select: { id: true, fullName: true, reference: true },
    });
    if (missing) referrerList.unshift(missing);
  }

  return {
    centres: centres.map((c) => ({ value: c.id, label: c.name })),
    projects: projects.map((p) => ({ value: p.id, label: p.name })),
    owners: owners.map((u) => ({ value: u.id, label: u.isActive ? u.name : `${u.name} (deactivated)` })),
    referrers: referrerList.map((c) => ({ value: c.id, label: `${c.fullName} · ${c.reference}` })),
  };
}
