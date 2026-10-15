import type { ReactNode } from 'react';

export type DefinitionItem = { label: string; value: ReactNode; wide?: boolean };

export function DefinitionList({ items }: { items: DefinitionItem[] }) {
  const shown = items.filter((item) => item.value !== null && item.value !== undefined && item.value !== '');
  if (shown.length === 0) return null;

  return (
    <dl className="grid gap-x-8 gap-y-5 sm:grid-cols-2">
      {shown.map((item) => (
        <div key={item.label} className={item.wide ? 'sm:col-span-2' : undefined}>
          <dt className="eyebrow">{item.label}</dt>
          <dd className="mt-1.5 text-sm leading-relaxed text-ink">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}
