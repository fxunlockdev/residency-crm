'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import clsx from 'clsx';

export type NavItem = {
  href: string;
  label: string;
  badge?: number;
  tone?: 'default' | 'alert';
};

export type NavGroup = { heading: string; items: NavItem[] };

export function SidebarNav({ groups }: { groups: NavGroup[] }) {
  const pathname = usePathname();

  return (
    <nav aria-label="Main navigation" className="space-y-7">
      {groups.map((group) => (
        <div key={group.heading}>
          <p className="eyebrow mb-2 px-3">{group.heading}</p>
          <ul className="space-y-0.5">
            {group.items.map((item) => {
              const active = item.href === '/' ? pathname === '/' : pathname.startsWith(item.href);
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    aria-current={active ? 'page' : undefined}
                    className={clsx(
                      'group relative flex items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors duration-200',
                      active
                        ? 'bg-ink text-cream'
                        : 'text-ink-soft hover:bg-cream-deep hover:text-ink',
                    )}
                  >
                    <span className="flex items-center gap-2.5">
                      <span
                        aria-hidden
                        className={clsx(
                          'h-4 w-[2px] rounded-full transition-colors duration-200',
                          active ? 'bg-pink' : 'bg-transparent group-hover:bg-line-strong',
                        )}
                      />
                      {item.label}
                    </span>
                    {item.badge ? (
                      <span
                        className={clsx(
                          'rounded-full px-1.5 py-0.5 text-micro font-semibold tabular',
                          item.tone === 'alert'
                            ? 'bg-pink text-white'
                            : active
                              ? 'bg-cream/20 text-cream'
                              : 'bg-cream-deep text-ink-mute',
                        )}
                      >
                        {item.badge > 999 ? '999+' : item.badge}
                      </span>
                    ) : null}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}
