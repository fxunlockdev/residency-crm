import 'server-only';
import { prisma } from '@/lib/prisma';
import { formatReference } from '@/lib/normalize';

/** Next free RF-#### reference. Retried by the caller if two writes race for the same number. */
export async function nextReference(): Promise<string> {
  const latest = await prisma.client.findFirst({
    orderBy: { reference: 'desc' },
    select: { reference: true },
  });
  const current = latest ? Number(latest.reference.replace(/\D/g, '')) : 0;
  return formatReference((Number.isFinite(current) ? current : 0) + 1);
}
