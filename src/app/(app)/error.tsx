'use client';

import { useEffect } from 'react';
import Link from 'next/link';

/** Keeps the app shell when a single page's data load fails. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error('Page failed to render', { name: error.name, message: error.message, digest: error.digest });
  }, [error]);

  return (
    <div className="mx-auto max-w-lg py-16 text-center">
      <p className="eyebrow">Something went wrong</p>
      <h1 className="h-page mt-3">This page could not load</h1>
      <p className="mt-3 text-sm leading-relaxed text-ink-mute">
        Your other work is unaffected. Try again, and quote reference{' '}
        <span className="tabular">{error.digest ?? 'unknown'}</span> if it keeps happening.
      </p>
      <div className="mt-7 flex items-center justify-center gap-3">
        <button type="button" onClick={reset} className="btn-primary">
          Try again
        </button>
        <Link href="/" className="btn-ghost">
          Dashboard
        </Link>
      </div>
    </div>
  );
}
