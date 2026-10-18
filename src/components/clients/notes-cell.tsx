'use client';

import { useCallback, useId, useRef, useState } from 'react';

type Position = { top: number; left: number; placeAbove: boolean };

/**
 * Notes are long and the column is narrow, so the cell shows what fits and
 * reveals the whole note on hover. Focus does the same thing, because a tooltip
 * only a mouse can reach is no use to anyone navigating by keyboard.
 *
 * The panel is positioned fixed rather than absolute: the table scrolls
 * horizontally, and an absolutely positioned panel is clipped by that scroll
 * container on the rows nearest the bottom.
 */
const PANEL_WIDTH = 416;
const ESTIMATED_HEIGHT = 220;

export function NotesCell({ notes }: { notes: string | null }) {
  const [position, setPosition] = useState<Position | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const id = useId();

  const show = useCallback(() => {
    const trigger = triggerRef.current;
    if (!trigger) return;
    const rect = trigger.getBoundingClientRect();
    const spaceBelow = window.innerHeight - rect.bottom;
    const placeAbove = spaceBelow < ESTIMATED_HEIGHT && rect.top > spaceBelow;

    setPosition({
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      // Keep the panel on screen when the cell is near the right edge.
      left: Math.max(8, Math.min(rect.left, window.innerWidth - PANEL_WIDTH - 8)),
      placeAbove,
    });
  }, []);

  const hide = useCallback(() => setPosition(null), []);

  if (!notes) return <span className="text-ink-mute">—</span>;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-describedby={position ? id : undefined}
        onMouseEnter={show}
        onMouseLeave={hide}
        onFocus={show}
        onBlur={hide}
        onClick={() => (position ? hide() : show())}
        className="block w-full cursor-help truncate text-left text-ink-soft underline decoration-line-strong decoration-dotted underline-offset-2 hover:text-ink"
      >
        {notes}
      </button>

      {position ? (
        <span
          id={id}
          role="tooltip"
          style={{
            position: 'fixed',
            top: position.top,
            left: position.left,
            width: PANEL_WIDTH,
            maxWidth: 'calc(100vw - 1rem)',
            transform: position.placeAbove ? 'translateY(-100%)' : undefined,
          }}
          className="z-50 block max-h-72 overflow-y-auto whitespace-pre-wrap rounded-xl border border-line-strong bg-cream-warm p-3 text-left text-xs leading-relaxed text-ink-soft shadow-lift"
        >
          {notes}
        </span>
      ) : null}
    </>
  );
}
