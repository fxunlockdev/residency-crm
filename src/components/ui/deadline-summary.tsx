import { daysUntil, formatDate } from '@/lib/dates';

/**
 * The two statutory dates were drawn two different ways on the dashboard and the
 * watchlist, with different copy for the same state. One component, one wording.
 */
export function DeadlineSummary({
  label,
  date,
  note,
  variant = 'inline',
}: {
  label: string;
  date: Date;
  note: string;
  variant?: 'inline' | 'card';
}) {
  const days = daysUntil(date);
  const passed = days !== null && days < 0;
  const urgent = days !== null && days >= 0 && days <= 60;

  const chipTone = passed
    ? 'border-line bg-cream-deep text-ink-mute'
    : urgent
      ? 'border-pink-deep/30 bg-pink-wash text-pink-deep'
      : 'border-stage-emerald/25 bg-stage-emerald/10 text-stage-emerald';

  return (
    <div
      className={
        variant === 'card'
          ? `rounded-xl2 border px-6 py-5 ${urgent ? 'border-pink/35 bg-pink-wash/50' : 'border-line bg-cream-warm'}`
          : 'px-6 py-5'
      }
    >
      <p className="eyebrow">{label}</p>
      <p className="mt-2 flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span className={variant === 'card' ? 'font-serif text-2xl font-medium' : 'font-serif text-xl font-medium'}>
          {formatDate(date)}
        </span>
        <span className={`chip ${chipTone}`}>{passed ? 'Deadline passed' : `${days} days left`}</span>
      </p>
      <p className="mt-2 text-sm text-ink-mute">{note}</p>
    </div>
  );
}
