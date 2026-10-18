'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { getCurrentUser } from '@/lib/auth';
import { CLIENTS_TABLE } from '@/lib/queries/table-prefs';
import { resolveColumns, resolveWidths } from '@/lib/table-columns';

/**
 * Saves one user's table layout. Any signed-in user may set their own, read-only
 * included: this changes nothing about the data, only how that person reads it.
 */
export async function saveTableLayoutAction(input: {
  table?: string;
  columns?: string[];
  widths?: Record<string, number>;
}): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  const table = input.table === CLIENTS_TABLE ? CLIENTS_TABLE : CLIENTS_TABLE;
  const existing = await prisma.userTablePreference.findUnique({
    where: { userId_table: { userId: user.id, table } },
  });

  // A partial save (just a width drag) must not wipe the column selection.
  const columns = input.columns
    ? resolveColumns(input.columns)
    : resolveColumns(existing?.columns);
  const widths = input.widths
    ? resolveWidths({ ...resolveWidths(existing?.widths), ...input.widths })
    : resolveWidths(existing?.widths);

  await prisma.userTablePreference.upsert({
    where: { userId_table: { userId: user.id, table } },
    update: { columns, widths },
    create: { userId: user.id, table, columns, widths },
  });

  revalidatePath('/clients');
  return { ok: true };
}

export async function resetTableLayoutAction(): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };

  await prisma.userTablePreference.deleteMany({
    where: { userId: user.id, table: CLIENTS_TABLE },
  });
  revalidatePath('/clients');
  return { ok: true };
}
