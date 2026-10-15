import clsx from 'clsx';

export function Alert({
  tone = 'error',
  title,
  children,
}: {
  tone?: 'error' | 'success' | 'info' | 'warning';
  title?: string;
  children?: React.ReactNode;
}) {
  const toneClass = {
    error: 'border-stage-rose/30 bg-stage-rose/8 text-stage-rose',
    success: 'border-stage-emerald/30 bg-stage-emerald/8 text-stage-emerald',
    info: 'border-stage-sky/30 bg-stage-sky/8 text-stage-sky',
    warning: 'border-stage-amber/35 bg-stage-amber/10 text-stage-amber',
  }[tone];

  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={clsx('rounded-xl border px-4 py-3 text-sm', toneClass)}>
      {title ? <p className="font-semibold">{title}</p> : null}
      {children ? <div className={clsx(title && 'mt-1', 'text-ink-soft')}>{children}</div> : null}
    </div>
  );
}
