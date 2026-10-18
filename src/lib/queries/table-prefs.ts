import 'server-only';
import { prisma } from '@/lib/prisma';
import { DEFAULT_COLUMNS, resolveColumns, resolveWidths } from '@/lib/table-columns';

export const CLIENTS_TABLE = 'clients';

export type TableLayout = { columns: string[]; widths: Record<string, number> };

/** A user's saved layout, falling back to the default view. */
export async function getTableLayout(userId: string | undefined, table = CLIENTS_TABLE): Promise<TableLayout> {
  if (!userId) return { columns: DEFAULT_COLUMNS, widths: {} };

  const saved = await prisma.userTablePreference.findUnique({
    where: { userId_table: { userId, table } },
  });
  if (!saved) return { columns: DEFAULT_COLUMNS, widths: {} };

  return { columns: resolveColumns(saved.columns), widths: resolveWidths(saved.widths) };
}
