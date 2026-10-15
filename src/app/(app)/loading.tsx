export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-live="polite">
      <span className="sr-only">Loading</span>
      <div className="mb-8 border-b border-line pb-6">
        <div className="h-3 w-24 rounded bg-cream-deep" />
        <div className="mt-3 h-7 w-80 max-w-full rounded bg-cream-deep" />
        <div className="mt-3 h-4 w-96 max-w-full rounded bg-cream-deep/70" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((index) => (
          <div key={index} className="h-28 rounded-xl2 border border-line bg-cream-deep/40" />
        ))}
      </div>
      <div className="mt-8 h-72 rounded-xl2 border border-line bg-cream-deep/30" />
    </div>
  );
}
