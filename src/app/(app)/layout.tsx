import Link from 'next/link';
import { requireUser } from '@/lib/auth';
import { logoutAction } from '@/server/auth-actions';
import { getNavCounts } from '@/lib/queries/counts';
import { SidebarNav, type NavGroup } from '@/components/shell/nav';
import { MobileNav } from '@/components/shell/mobile-nav';
import { GlobalSearch } from '@/components/shell/global-search';
import { ROLE_LABEL } from '@/lib/labels';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  const counts = await getNavCounts();

  const groups: NavGroup[] = [
    {
      heading: 'Overview',
      items: [
        { href: '/', label: 'Dashboard' },
        { href: '/pipeline', label: 'Sales pipeline' },
        { href: '/clients', label: 'Clients', badge: counts.activeClients },
      ],
    },
    {
      heading: 'Work queues',
      items: [
        { href: '/follow-ups', label: 'Follow-ups', badge: counts.followUps, tone: counts.followUps ? 'alert' : 'default' },
        { href: '/deadlines', label: 'Deadlines' },
        {
          href: '/commissions',
          label: 'Commissions',
          badge: counts.commissionsNeedingAction,
          tone: counts.commissionsNeedingAction ? 'alert' : 'default',
        },
      ],
    },
    {
      heading: 'Insight',
      items: [
        { href: '/lead-sources', label: 'Lead sources' },
        { href: '/meetings', label: 'Meetings' },
        { href: '/activity', label: 'Activity log' },
      ],
    },
    {
      heading: 'Admin',
      items: [{ href: '/settings', label: 'Settings' }],
    },
  ];

  const initials = user.name
    .split(' ')
    .map((part) => part[0])
    .filter(Boolean)
    .slice(0, 2)
    .join('')
    .toUpperCase();

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[16rem_1fr]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-cream"
      >
        Skip to content
      </a>

      {/* Sidebar */}
      <aside className="sticky top-0 hidden h-dvh flex-col border-r border-line bg-cream-warm/70 px-4 py-6 lg:flex">
        <Link href="/" className="mb-8 block px-3 font-serif text-base tracking-tight">
          Residency<span className="text-pink-deep">First</span>
          <span className="mt-0.5 block text-micro font-sans font-semibold uppercase tracking-[0.09em] text-ink-mute">
            EB-5 Tracker
          </span>
        </Link>

        <GlobalSearch className="mb-6 px-1" />

        <div className="flex-1 overflow-y-auto">
          <SidebarNav groups={groups} />
        </div>

        <div className="mt-6 border-t border-line pt-4">
          <div className="flex items-center gap-3 px-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-ink text-xs font-semibold text-cream">
              {initials}
            </span>
            <span className="min-w-0">
              <span className="block truncate text-sm font-medium text-ink">{user.name}</span>
              <span className="block text-xs text-ink-mute">{ROLE_LABEL[user.role]}</span>
            </span>
          </div>
          <form action={logoutAction} className="mt-2 px-1">
            <button type="submit" className="btn-quiet w-full justify-start">
              Sign out
            </button>
          </form>
        </div>
      </aside>

      {/* Content */}
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-line bg-cream/85 px-4 py-3 backdrop-blur lg:hidden">
          <Link href="/" className="shrink-0 font-serif text-base tracking-tight">
            Residency<span className="text-pink-deep">First</span>
          </Link>
          <GlobalSearch className="min-w-0 flex-1 max-w-xs" />
          <MobileNav groups={groups} />
        </header>

        <main id="main" className="mx-auto w-full min-w-0 max-w-shell flex-1 px-4 py-8 sm:px-8 lg:px-10 lg:py-10">
          {children}
        </main>

        <footer className="border-t border-line px-4 py-5 text-xs text-ink-mute sm:px-8 lg:px-10">
          Residency First EB-5 Tracker · Do not store passports, identity documents, source-of-funds
          evidence or bank details here — the attorney holds those.
        </footer>
      </div>
    </div>
  );
}
