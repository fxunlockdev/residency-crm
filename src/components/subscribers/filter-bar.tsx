'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import clsx from 'clsx';

const CHANNELS = [
  { value: 'all', label: 'All' },
  { value: 'email', label: 'Email' },
  { value: 'whatsapp', label: 'WhatsApp' },
];

const STATUSES = [
  { value: 'active', label: 'Subscribed' },
  { value: 'unsubscribed', label: 'Unsubscribed' },
  { value: 'any', label: 'Everyone' },
];

export function SubscriberFilterBar({ total }: { total: number }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const firstRender = useRef(true);

  const channel = searchParams.get('channel') ?? 'all';
  const status = searchParams.get('status') ?? 'active';

  const push = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      // A new filter means a new first page; keeping the old page number
      // lands the reader on an empty one.
      params.delete('page');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Debounced, so typing a name is one navigation rather than one per letter.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => push({ q: query || null }), 300);
    return () => clearTimeout(timer);
  }, [query, push]);

  return (
    <div className="mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="flex flex-wrap items-end gap-5">
        <Group label="Channel" options={CHANNELS} active={channel} onPick={(value) => push({ channel: value })} />
        <Group label="Status" options={STATUSES} active={status} onPick={(value) => push({ status: value })} />
      </div>

      <div className="sm:w-72">
        <label className="field-label" htmlFor="subscriber-search">
          Search
        </label>
        <input
          id="subscriber-search"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Name, email or number"
          className="field"
        />
        <p className="field-hint" role="status">
          {total} {total === 1 ? 'person' : 'people'} match
        </p>
      </div>
    </div>
  );
}

function Group({
  label,
  options,
  active,
  onPick,
}: {
  label: string;
  options: Array<{ value: string; label: string }>;
  active: string;
  onPick: (value: string) => void;
}) {
  return (
    <fieldset>
      <legend className="field-label">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={active === option.value}
            onClick={() => onPick(option.value)}
            className={clsx(
              'rounded-full border px-3.5 py-1.5 text-xs font-medium transition-colors duration-200',
              active === option.value
                ? 'border-pink-deep bg-pink-wash text-ink'
                : 'border-line-field text-ink-mute hover:border-ink-soft hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
    </fieldset>
  );
}
