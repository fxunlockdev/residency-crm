import type { ReactNode } from 'react';

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl2 border border-dashed border-line-strong bg-cream-deep/40 px-6 py-14 text-center">
      <p className="font-serif text-lg text-ink">{title}</p>
      {description ? <p className="mt-1.5 max-w-sm text-sm text-ink-mute">{description}</p> : null}
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}
