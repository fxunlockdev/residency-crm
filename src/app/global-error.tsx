'use client';

/**
 * Catches failures in the root layout itself, which the segment-level
 * error.tsx cannot reach. It must render its own <html> and <body>.
 */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: '100dvh',
          display: 'grid',
          placeItems: 'center',
          background: '#FAF6F1',
          color: '#0E0D12',
          fontFamily: 'Georgia, serif',
          padding: '2rem',
          textAlign: 'center',
        }}
      >
        <main>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 500, margin: 0 }}>The tracker could not start</h1>
          <p style={{ maxWidth: '28rem', margin: '0.75rem auto 0', fontFamily: 'system-ui, sans-serif', fontSize: '0.9rem', color: '#6E6A75', lineHeight: 1.6 }}>
            Something failed before the page could load. Reference{' '}
            <span>{error.digest ?? 'unknown'}</span>.
          </p>
          <button
            type="button"
            onClick={reset}
            style={{
              marginTop: '1.5rem',
              border: 0,
              borderRadius: '999px',
              background: '#0E0D12',
              color: '#FAF6F1',
              padding: '0.6rem 1.25rem',
              fontFamily: 'system-ui, sans-serif',
              fontSize: '0.875rem',
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
