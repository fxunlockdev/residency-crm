import 'server-only';
import { prisma } from '@/lib/prisma';
import { formatReference } from '@/lib/normalize';

/**
 * Next free RF-#### reference.
 *
 * The maximum is taken numerically, not by string order: 'RF-9999' sorts above
 * 'RF-10000', so a lexicographic max would wedge permanently at five digits.
 * Retried by the caller if two writes race for the same number.
 */
export async function nextReference(): Promise<string> {
  const rows = await prisma.$queryRaw<Array<{ max: number | null }>>`
    SELECT MAX(NULLIF(regexp_replace("reference", '\D', '', 'g'), '')::bigint) AS max FROM "Client"
  `;
  const current = Number(rows[0]?.max ?? 0);
  return formatReference((Number.isFinite(current) ? current : 0) + 1);
}
