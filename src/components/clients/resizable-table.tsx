'use client';

import { useEffect, useRef, useState } from 'react';
import { MAX_COLUMN_WIDTH, MIN_COLUMN_WIDTH } from '@/lib/table-columns';
import { saveTableLayoutAction } from '@/server/table-prefs-actions';

/**
 * Drag-to-resize for the table's columns.
 *
 * Widths live on the <colgroup>, which is what makes a fixed-layout table
 * respect them, and are written straight to the DOM while dragging so the
 * pointer stays glued to the handle. The result is saved once on release
 * rather than on every mouse move.
 */
export function ColumnResizer({ columnKey, index }: { columnKey: string; index: number }) {
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startWidth = useRef(0);

  useEffect(() => {
    if (!dragging) return;

    const col = () =>
      document.querySelector<HTMLTableColElement>(`col[data-column-index="${index}"]`);

    const onMove = (event: MouseEvent) => {
      const next = Math.min(
        MAX_COLUMN_WIDTH,
        Math.max(MIN_COLUMN_WIDTH, startWidth.current + (event.clientX - startX.current)),
      );
      const target = col();
      if (target) target.style.width = `${next}px`;
    };

    const onUp = () => {
      setDragging(false);
      const target = col();
      const width = target ? Number.parseInt(target.style.width, 10) : NaN;
      if (Number.isFinite(width)) {
        void saveTableLayoutAction({ widths: { [columnKey]: width } });
      }
    };

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp, { once: true });
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    return () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };
  }, [dragging, columnKey, index]);

  /** Keyboard parity: a drag handle nobody can reach by keyboard is not a control. */
  const nudge = (delta: number) => {
    const target = document.querySelector<HTMLTableColElement>(`col[data-column-index="${index}"]`);
    if (!target) return;
    const current = Number.parseInt(target.style.width, 10) || MIN_COLUMN_WIDTH;
    const next = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, current + delta));
    target.style.width = `${next}px`;
    void saveTableLayoutAction({ widths: { [columnKey]: next } });
  };

  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Resize column"
      tabIndex={0}
      onMouseDown={(event) => {
        event.preventDefault();
        const col = document.querySelector<HTMLTableColElement>(`col[data-column-index="${index}"]`);
        startX.current = event.clientX;
        startWidth.current = col ? Number.parseInt(col.style.width, 10) || 0 : 0;
        setDragging(true);
      }}
      onKeyDown={(event) => {
        if (event.key === 'ArrowLeft') {
          event.preventDefault();
          nudge(-16);
        }
        if (event.key === 'ArrowRight') {
          event.preventDefault();
          nudge(16);
        }
      }}
      className="absolute right-0 top-0 h-full w-2 translate-x-1/2 cursor-col-resize select-none border-r-2 border-transparent transition-colors hover:border-pink focus-visible:border-pink"
    />
  );
}
