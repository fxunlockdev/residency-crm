import 'server-only';
import { after } from 'next/server';

/**
 * Run follow-up work once the response is on its way.
 *
 * `after` throws when there is no request scope, which happens in tests and in
 * scripts. The callers here have already committed a durable write, so letting
 * that throw would turn a successful submission into a 500. Fall back to
 * running the task detached: it swallows its own errors either way.
 */
export function afterResponse(task: () => Promise<void>): void {
  const guarded = () => task().catch(() => undefined);
  try {
    after(guarded);
  } catch {
    void guarded();
  }
}
