import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { LoginForm } from './login-form';

export const metadata: Metadata = { title: 'Sign in' };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const user = await getCurrentUser();
  if (user) redirect('/');
  const { next } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.1fr_1fr]">
      {/* Brand panel */}
      <section className="relative hidden overflow-hidden bg-ink px-12 py-14 text-cream lg:flex lg:flex-col lg:justify-between">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-32 -top-24 h-[30rem] w-[30rem] rounded-full bg-pink/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-20 h-[26rem] w-[26rem] rounded-full bg-pink-deep/20 blur-3xl"
        />

        <p className="relative font-serif text-xl tracking-tight">
          Residency<span className="text-pink">First</span>
        </p>

        <div className="relative max-w-lg">
          <p className="eyebrow text-pink-soft">EB-5 client &amp; commission tracker</p>
          <h1 className="mt-4 text-display font-light leading-[1.03]">
            Every investor, from the first click to the&nbsp;
            <span className="italic text-pink-soft">I-829 approval</span>.
          </h1>
          <p className="mt-6 max-w-md text-sm leading-relaxed text-cream/70">
            One record per applicant, every meeting logged, every commission accounted for — with
            the filing and investment deadlines always in view.
          </p>
        </div>

        <dl className="relative grid grid-cols-3 gap-6 border-t border-cream/15 pt-7">
          {[
            ['Pipeline', '9 stages'],
            ['Deadline', '30 Nov 2026'],
            ['Then', '1 Jan 2027'],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="eyebrow text-cream/45">{label}</dt>
              <dd className="mt-1.5 font-serif text-lg text-cream">{value}</dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Form panel */}
      <section className="flex items-center justify-center px-6 py-14 sm:px-12">
        <div className="w-full max-w-sm">
          <p className="font-serif text-lg tracking-tight lg:hidden">
            Residency<span className="text-pink-deep">First</span>
          </p>
          <h2 className="mt-6 font-serif text-2xl font-medium lg:mt-0">Sign in</h2>
          <p className="mb-8 mt-1.5 text-sm text-ink-mute">Use the account Residency First issued you.</p>
          <LoginForm next={next} />
        </div>
      </section>
    </main>
  );
}
