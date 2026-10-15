import Link from 'next/link';

export default function NotFound() {
  return (
    <main className="flex min-h-dvh items-center justify-center px-6 py-16">
      <div className="max-w-md text-center">
        <p className="eyebrow">404</p>
        <h1 className="h-page mt-3">That page does not exist</h1>
        <p className="mt-3 text-sm leading-relaxed text-ink-mute">
          The record may have been deleted, or the link may be out of date.
        </p>
        <Link href="/" className="btn-primary mt-7">
          Back to the dashboard
        </Link>
      </div>
    </main>
  );
}
