'use client';

import { useEffect } from 'react';

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    // Surfaced in the Railway logs; the digest is the only safe identifier to show a user.
    console.error('Unhandled application error', error);
  }, [error]);

  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p className="eyebrow">Something went wrong</p>
        <h1 className="h-page mt-3">We could not load that</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-mute">
          The error has been logged. Try again, and if it keeps happening quote reference{' '}
          <span className="tabular">{error.digest ?? 'unknown'}</span>.
        </p>
        <div className="mt-7 flex items-center justify-center gap-3">
          <button type="button" onClick={reset} className="btn-primary">
            Try again
          </button>
          <a href="/" className="btn-ghost">
            Dashboard
          </a>
        </div>
      </div>
    </main>
  );
}
