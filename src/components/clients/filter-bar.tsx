'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/pipeline';
import { SOURCE_LABEL } from '@/lib/labels';
import type { LeadSource } from '@prisma/client';

type Option = { value: string; label: string };

export function ClientFilterBar({
  centres,
  projects,
  countries,
  total,
}: {
  centres: Option[];
  projects: Option[];
  countries: Option[];
  total: number;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState(searchParams.get('q') ?? '');
  const firstRender = useRef(true);

  const push = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null || value === '') params.delete(key);
        else params.set(key, value);
      }
      params.delete('page');
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams],
  );

  // Debounce the free-text search so each keystroke does not hit the database.
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const timer = setTimeout(() => push({ q: query || null }), 300);
    return () => clearTimeout(timer);
  }, [query, push]);

  const activeCount = ['status', 'source', 'centre', 'project', 'country', 'lost'].filter((key) =>
    searchParams.get(key),
  ).length;

  return (
    <div className="mb-6 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[18rem] flex-[2]">
          <label htmlFor="client-search" className="sr-only">
            Search clients
          </label>
          <input
            id="client-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search name, email, reference, receipt number…"
            className="field pl-10"
          />
          <span aria-hidden className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-mute">
            ⌕
          </span>
        </div>

        <Select
          label="Stage"
          value={searchParams.get('status') ?? ''}
          onChange={(value) => push({ status: value })}
          options={STATUS_ORDER.map((status) => ({ value: status, label: STATUS_LABEL[status] }))}
          allLabel="All active stages"
        />

        <Select
          label="Source"
          value={searchParams.get('source') ?? ''}
          onChange={(value) => push({ source: value })}
          options={(Object.keys(SOURCE_LABEL) as LeadSource[]).map((source) => ({
            value: source,
            label: SOURCE_LABEL[source],
          }))}
          allLabel="Any source"
        />

        <Select
          label="Regional centre"
          value={searchParams.get('centre') ?? ''}
          onChange={(value) => push({ centre: value })}
          options={centres}
          allLabel="Any centre"
        />

        <Select
          label="Project"
          value={searchParams.get('project') ?? ''}
          onChange={(value) => push({ project: value })}
          options={projects}
          allLabel="Any project"
        />

        <Select
          label="Country of birth"
          value={searchParams.get('country') ?? ''}
          onChange={(value) => push({ country: value })}
          options={countries}
          allLabel="Any country"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-ink-mute">
        <div className="flex flex-wrap items-center gap-4">
          <label className="inline-flex cursor-pointer items-center gap-2">
            <input
              type="checkbox"
              checked={searchParams.get('lost') === '1'}
              onChange={(event) => push({ lost: event.target.checked ? '1' : null })}
              className="h-4 w-4 rounded border-line-strong text-pink-deep focus:ring-pink/40"
            />
            Include lost / not proceeding
          </label>

          <span className="tabular">
            {total} {total === 1 ? 'client' : 'clients'}
          </span>

          {activeCount > 0 ? (
            <button
              type="button"
              className="btn-quiet"
              onClick={() => router.replace(pathname, { scroll: false })}
            >
              Clear {activeCount} filter{activeCount === 1 ? '' : 's'}
            </button>
          ) : null}
        </div>

        <Select
          label="Sort"
          inline
          value={searchParams.get('sort') ?? 'name'}
          onChange={(value) => push({ sort: value === 'name' ? null : value })}
          options={[
            { value: 'name', label: 'Surname A–Z' },
            { value: 'stage', label: 'Pipeline stage' },
            { value: 'followUp', label: 'Follow-up date' },
            { value: 'recent', label: 'Recently updated' },
            { value: 'created', label: 'Newest first' },
            { value: 'reference', label: 'Reference' },
          ]}
        />
      </div>
    </div>
  );
}

function Select({
  label,
  value,
  onChange,
  options,
  allLabel,
  inline,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: Option[];
  allLabel?: string;
  inline?: boolean;
}) {
  if (options.length === 0) return null;
  return (
    <label className={inline ? 'inline-flex items-center gap-2 text-sm' : undefined}>
      <span className={inline ? 'text-ink-mute' : 'sr-only'}>{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="field w-auto min-w-[9rem] max-w-[13rem] py-2 text-sm"
      >
        {allLabel ? <option value="">{allLabel}</option> : null}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}
