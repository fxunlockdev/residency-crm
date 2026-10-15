'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import { SidebarNav, type NavGroup } from './nav';

export function MobileNav({ groups }: { groups: NavGroup[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="lg:hidden">
      <button
        type="button"
        className="btn-ghost"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="mobile-navigation"
      >
        <span aria-hidden>☰</span>
        Menu
      </button>

      {open ? (
        <div className="fixed inset-0 z-50 flex">
          <button
            type="button"
            aria-label="Close navigation"
            className="absolute inset-0 bg-ink/40 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />
          <div
            id="mobile-navigation"
            className="relative flex h-full w-72 max-w-[85vw] flex-col overflow-y-auto border-r border-line bg-cream-warm px-4 py-6"
          >
            <div className="mb-6 flex items-center justify-between px-3">
              <p className="font-serif text-base tracking-tight">
                Residency<span className="text-pink-deep">First</span>
              </p>
              <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
                Close
              </button>
            </div>
            <SidebarNav groups={groups} />
          </div>
        </div>
      ) : null}
    </div>
  );
}
