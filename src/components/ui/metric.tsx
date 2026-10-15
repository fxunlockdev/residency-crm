import Link from 'next/link';
import clsx from 'clsx';

export function Metric({
  label,
  value,
  sub,
  href,
  tone = 'default',
}: {
  label: string;
  value: string;
  sub?: string;
  href?: string;
  tone?: 'default' | 'accent' | 'alert';
}) {
  const body = (
    <>
      <p className="eyebrow">{label}</p>
      <p
        className={clsx(
          'mt-3 font-serif text-metric font-medium tabular',
          tone === 'alert' ? 'text-pink-deep' : 'text-ink',
        )}
      >
        {value}
      </p>
      {sub ? <p className="mt-1.5 text-xs text-ink-mute">{sub}</p> : null}
    </>
  );

  const base = clsx(
    'relative overflow-hidden rounded-xl2 border bg-cream-warm px-5 py-5 shadow-card transition-all duration-200 ease-out',
    tone === 'accent' && 'border-pink/30 bg-pink-wash/50',
    tone === 'alert' && 'border-pink-deep/25',
    tone === 'default' && 'border-line',
    href && 'group hover:-translate-y-0.5 hover:shadow-lift',
  );

  if (!href) return <div className={base}>{body}</div>;

  return (
    <Link href={href} className={clsx(base, 'block')}>
      {body}
      <span
        aria-hidden
        className="absolute bottom-4 right-5 text-ink-mute transition-transform duration-200 ease-out group-hover:translate-x-0.5"
      >
        →
      </span>
    </Link>
  );
}
