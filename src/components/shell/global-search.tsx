/**
 * Finding a person is the most common action in a 145-client book, so it must be
 * reachable from every screen. A plain GET form needs no client JavaScript.
 */
export function GlobalSearch({ className }: { className?: string }) {
  return (
    <form action="/clients" method="get" role="search" className={className}>
      <label htmlFor="global-search" className="sr-only">
        Search clients
      </label>
      <div className="relative">
        <input
          id="global-search"
          name="q"
          type="search"
          placeholder="Search clients…"
          className="field py-2 pl-9 text-sm"
          autoComplete="off"
        />
        <span aria-hidden className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-mute">
          ⌕
        </span>
        {/* An explicit submit keeps Enter working everywhere and gives
            assistive tech a control to activate. */}
        <button type="submit" className="sr-only">
          Search
        </button>
      </div>
    </form>
  );
}
