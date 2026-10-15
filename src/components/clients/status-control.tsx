import { changeStatusAction } from '@/server/client-actions';
import { STATUS_LABEL, STATUS_ORDER, statusIndex } from '@/lib/pipeline';
import type { ClientStatus } from '@prisma/client';

/** Progressive-enhancement status control: a plain form, no client JavaScript required. */
export function StatusControl({ clientId, status }: { clientId: string; status: ClientStatus }) {
  const index = statusIndex(status);
  const next = status === 'LOST' ? null : STATUS_ORDER[index + 1];
  const nextForward = next && next !== 'LOST' ? next : null;

  return (
    <div className="flex flex-wrap items-center gap-2">
      {nextForward ? (
        <form action={changeStatusAction}>
          <input type="hidden" name="clientId" value={clientId} />
          <input type="hidden" name="status" value={nextForward} />
          <button type="submit" className="btn-accent">
            Advance to {STATUS_LABEL[nextForward]}
          </button>
        </form>
      ) : null}

      <form action={changeStatusAction} className="flex items-center gap-2">
        <input type="hidden" name="clientId" value={clientId} />
        <label className="sr-only" htmlFor="status-jump">
          Move to a different stage
        </label>
        <select id="status-jump" name="status" defaultValue={status} className="field w-auto py-2 text-sm">
          {STATUS_ORDER.map((value) => (
            <option key={value} value={value}>
              {STATUS_LABEL[value]}
            </option>
          ))}
        </select>
        <button type="submit" className="btn-ghost">
          Move
        </button>
      </form>
    </div>
  );
}
