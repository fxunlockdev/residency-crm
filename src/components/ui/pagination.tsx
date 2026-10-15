import Link from 'next/link';

export function Pagination({
  page,
  pageCount,
  total,
  pageSize,
  baseParams,
}: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  baseParams: Record<string, string | undefined>;
}) {
  if (pageCount <= 1) return null;

  const href = (target: number) => {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(baseParams)) {
      if (value) params.set(key, value);
    }
    if (target > 1) params.set('page', String(target));
    const query = params.toString();
    return query ? `?${query}` : '?';
  };

  const first = (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);

  return (
    <nav className="mt-6 flex items-center justify-between gap-4 text-sm" aria-label="Pagination">
      <p className="text-ink-mute tabular">
        {first}–{last} of {total}
      </p>
      <div className="flex items-center gap-2">
        {page > 1 ? (
          <Link href={href(page - 1)} className="btn-ghost" rel="prev">
            ← Previous
          </Link>
        ) : (
          <span className="btn-ghost pointer-events-none opacity-40">← Previous</span>
        )}
        <span className="px-2 text-ink-mute tabular">
          Page {page} of {pageCount}
        </span>
        {page < pageCount ? (
          <Link href={href(page + 1)} className="btn-ghost" rel="next">
            Next →
          </Link>
        ) : (
          <span className="btn-ghost pointer-events-none opacity-40">Next →</span>
        )}
      </div>
    </nav>
  );
}
