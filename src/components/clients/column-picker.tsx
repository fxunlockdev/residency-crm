'use client';

import { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AVAILABLE_COLUMNS, PINNED_COLUMN, columnDef } from '@/lib/table-columns';
import { resetTableLayoutAction, saveTableLayoutAction } from '@/server/table-prefs-actions';

/** Choose which columns appear, and in what order. Saved per user. */
export function ColumnPicker({ columns }: { columns: string[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(columns);
  const [pending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => setSelected(columns), [columns]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  const save = (next: string[]) => {
    setSelected(next);
    startTransition(async () => {
      await saveTableLayoutAction({ columns: next });
      router.refresh();
    });
  };

  const toggle = (key: string) => {
    save(selected.includes(key) ? selected.filter((k) => k !== key) : [...selected, key]);
  };

  const move = (key: string, direction: -1 | 1) => {
    const index = selected.indexOf(key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= selected.length) return;
    const next = [...selected];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    save(next);
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        className="btn-ghost"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        Columns
        <span className="rounded-full bg-cream-deep px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular text-ink-mute">
          {selected.length + 1}
        </span>
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 max-h-[28rem] w-80 overflow-y-auto rounded-xl2 border border-line bg-cream-warm p-4 shadow-lift">
          <div className="mb-3 flex items-baseline justify-between">
            <p className="h-section text-base">Columns</p>
            <button
              type="button"
              className="btn-quiet px-2 py-1 text-xs"
              onClick={() =>
                startTransition(async () => {
                  await resetTableLayoutAction();
                  router.refresh();
                })
              }
            >
              Reset
            </button>
          </div>

          <p className="mb-3 text-xs text-ink-mute">
            {PINNED_COLUMN.label} always shows and stays put while you scroll sideways.
          </p>

          {selected.length > 0 ? (
            <div className="mb-4">
              <p className="eyebrow mb-2">Showing, in order</p>
              <ul className="space-y-1">
                {selected.map((key, index) => (
                  <li key={key} className="flex items-center gap-1 rounded-lg bg-cream-deep/60 px-2 py-1">
                    <span className="min-w-0 flex-1 truncate text-sm">{columnDef(key)?.label ?? key}</span>
                    <button
                      type="button"
                      className="btn-quiet px-1.5 py-0.5 text-xs"
                      disabled={index === 0 || pending}
                      aria-label={`Move ${columnDef(key)?.label} left`}
                      onClick={() => move(key, -1)}
                    >
                      ←
                    </button>
                    <button
                      type="button"
                      className="btn-quiet px-1.5 py-0.5 text-xs"
                      disabled={index === selected.length - 1 || pending}
                      aria-label={`Move ${columnDef(key)?.label} right`}
                      onClick={() => move(key, 1)}
                    >
                      →
                    </button>
                    <button
                      type="button"
                      className="btn-quiet px-1.5 py-0.5 text-xs"
                      aria-label={`Remove ${columnDef(key)?.label}`}
                      onClick={() => toggle(key)}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <p className="eyebrow mb-2">Add a column</p>
          <ul className="space-y-0.5">
            {AVAILABLE_COLUMNS.filter((column) => !selected.includes(column.key)).map((column) => (
              <li key={column.key}>
                <button
                  type="button"
                  className="w-full rounded-lg px-2 py-1.5 text-left text-sm text-ink-soft transition-colors hover:bg-cream-deep hover:text-ink"
                  onClick={() => toggle(column.key)}
                >
                  + {column.label}
                  {column.hint ? <span className="block text-xs text-ink-mute">{column.hint}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
