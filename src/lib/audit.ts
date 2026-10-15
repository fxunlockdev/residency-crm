import 'server-only';
import { prisma } from './prisma';
import type { CurrentUser } from './auth';

type AuditInput = {
  entity: 'Client' | 'Meeting' | 'Commission' | 'Document' | 'User';
  entityId: string;
  action: 'created' | 'updated' | 'deleted' | 'status_changed' | 'uploaded' | 'imported' | 'signed_in';
  field?: string;
  oldValue?: string | null;
  newValue?: string | null;
  summary?: string;
  actor?: Pick<CurrentUser, 'id' | 'name'> | null;
  /** For non-user actors such as the website form or a scheduled job. */
  actorLabel?: string;
};

export async function recordAudit(input: AuditInput): Promise<void> {
  await prisma.auditLog.create({
    data: {
      entity: input.entity,
      entityId: input.entityId,
      action: input.action,
      field: input.field ?? null,
      oldValue: input.oldValue ?? null,
      newValue: input.newValue ?? null,
      summary: input.summary ?? null,
      actorId: input.actor?.id ?? null,
      actorLabel: input.actor?.name ?? input.actorLabel ?? 'System',
    },
  });
}

/** Diff two flat records and return one audit row per changed field. */
export function diffFields<T extends Record<string, unknown>>(
  before: T,
  after: Partial<T>,
): Array<{ field: string; oldValue: string | null; newValue: string | null }> {
  const changes: Array<{ field: string; oldValue: string | null; newValue: string | null }> = [];
  for (const [field, nextValue] of Object.entries(after)) {
    const previous = before[field];
    if (serialise(previous) === serialise(nextValue)) continue;
    changes.push({ field, oldValue: serialise(previous), newValue: serialise(nextValue) });
  }
  return changes;
}

function serialise(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return String(value);
}
