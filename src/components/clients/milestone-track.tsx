import clsx from 'clsx';
import { formatDate } from '@/lib/dates';

export type Milestone = { label: string; date: Date | null; reached: boolean };

/** A compact vertical record of the case, newest state at the bottom. */
export function MilestoneTrack({ milestones }: { milestones: Milestone[] }) {
  return (
    <ol className="relative space-y-0">
      {milestones.map((milestone, index) => {
        const last = index === milestones.length - 1;
        return (
          <li key={milestone.label} className="relative flex gap-4 pb-5 last:pb-0">
            {!last ? (
              <span
                aria-hidden
                className={clsx(
                  'absolute left-[5px] top-4 h-full w-px',
                  milestone.reached ? 'bg-pink/40' : 'bg-line',
                )}
              />
            ) : null}
            <span
              aria-hidden
              className={clsx(
                'relative mt-1 h-[11px] w-[11px] shrink-0 rounded-full border-2',
                milestone.reached ? 'border-pink bg-pink' : 'border-line-strong bg-cream-warm',
              )}
            />
            <span className="min-w-0 flex-1">
              <span
                className={clsx(
                  'block text-sm',
                  milestone.reached ? 'font-medium text-ink' : 'text-ink-mute',
                )}
              >
                {milestone.label}
              </span>
              <span className="block text-xs text-ink-mute tabular">
                {milestone.date ? formatDate(milestone.date) : milestone.reached ? 'Date not recorded' : 'Not yet'}
              </span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
