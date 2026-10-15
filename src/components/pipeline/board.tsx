'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import type { ClientStatus } from '@prisma/client';
import { STATUS_LABEL, STATUS_ORDER, STATUS_TONE } from '@/lib/pipeline';
import { formatCents } from '@/lib/money';
import { relativeDays } from '@/lib/dates';
import { changeStatusAction } from '@/server/client-actions';

export type BoardCard = {
  id: string;
  reference: string;
  fullName: string;
  status: ClientStatus;
  countryOfBirth: string | null;
  projectName: string | null;
  commissionCents: number;
  followUpDate: Date | null;
  nextAction: string | null;
};

const RAIL_TONE: Record<string, string> = {
  slate: 'bg-stage-slate',
  sky: 'bg-stage-sky',
  amber: 'bg-stage-amber',
  violet: 'bg-stage-violet',
  emerald: 'bg-stage-emerald',
  rose: 'bg-stage-rose',
};

export function PipelineBoard({ cards, canEdit }: { cards: BoardCard[]; canEdit: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<ClientStatus | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, ClientStatus>>({});

  const statusOf = (card: BoardCard) => optimistic[card.id] ?? card.status;

  const move = (clientId: string, status: ClientStatus) => {
    if (!canEdit) return;
    setOptimistic((current) => ({ ...current, [clientId]: status }));
    const formData = new FormData();
    formData.set('clientId', clientId);
    formData.set('status', status);
    startTransition(async () => {
      await changeStatusAction(formData);
      router.refresh();
    });
  };

  return (
    <div
      // `relative` matters: the sr-only labels on each card are absolutely
      // positioned, and without a containing block here they escape the scroll
      // track and widen the whole page (851px of phantom scroll on mobile).
      className={clsx('relative max-w-full overflow-x-auto pb-4 transition-opacity', pending && 'opacity-70')}
      aria-busy={pending}
    >
      <div className="flex min-w-max gap-4">
        {STATUS_ORDER.map((status) => {
          const columnCards = cards.filter((card) => statusOf(card) === status);
          const value = columnCards.reduce((sum, card) => sum + card.commissionCents, 0);
          const isTarget = hoverColumn === status && dragging !== null;

          return (
            <section
              key={status}
              aria-label={STATUS_LABEL[status]}
              className={clsx(
                'flex w-[17.5rem] shrink-0 flex-col rounded-xl2 border bg-cream-warm/60 transition-colors duration-200',
                isTarget ? 'border-pink bg-pink-wash/60' : 'border-line',
              )}
              onDragOver={(event) => {
                if (!canEdit || !dragging) return;
                event.preventDefault();
                setHoverColumn(status);
              }}
              onDragLeave={() => setHoverColumn((current) => (current === status ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setHoverColumn(null);
                const clientId = event.dataTransfer.getData('text/plain') || dragging;
                setDragging(null);
                if (clientId) move(clientId, status);
              }}
            >
              <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span aria-hidden className={clsx('h-3 w-[3px] rounded-full', RAIL_TONE[STATUS_TONE[status]])} />
                    <span className="truncate">{STATUS_LABEL[status]}</span>
                  </p>
                  {value > 0 ? (
                    <p className="mt-1 pl-[11px] text-xs text-ink-mute tabular">{formatCents(value)} in commission</p>
                  ) : null}
                </div>
                <span className="shrink-0 rounded-full bg-cream-deep px-2 py-0.5 text-xs font-semibold tabular text-ink-mute">
                  {columnCards.length}
                </span>
              </header>

              <ul className="flex-1 space-y-2 p-3">
                {columnCards.length === 0 ? (
                  <li className="rounded-lg border border-dashed border-line px-3 py-6 text-center text-xs text-ink-mute">
                    {canEdit ? 'Drop a card here' : 'Empty'}
                  </li>
                ) : (
                  columnCards.map((card) => (
                    <li key={card.id}>
                      <article
                        draggable={canEdit}
                        onDragStart={(event) => {
                          event.dataTransfer.setData('text/plain', card.id);
                          event.dataTransfer.effectAllowed = 'move';
                          setDragging(card.id);
                        }}
                        onDragEnd={() => {
                          setDragging(null);
                          setHoverColumn(null);
                        }}
                        className={clsx(
                          'rounded-lg border border-line bg-cream-warm p-3 shadow-card transition-all duration-200',
                          canEdit && 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-lift',
                          dragging === card.id && 'opacity-50',
                        )}
                      >
                        <Link href={`/clients/${card.id}`} className="block">
                          <p className="truncate text-sm font-medium text-ink">{card.fullName}</p>
                          <p className="mt-0.5 text-xs text-ink-mute tabular">
                            {card.reference}
                            {card.countryOfBirth ? ` · ${card.countryOfBirth}` : ''}
                          </p>
                        </Link>

                        {card.projectName ? (
                          <p className="mt-2 truncate text-xs text-ink-soft">{card.projectName}</p>
                        ) : null}

                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                          {card.commissionCents > 0 ? (
                            <span className="font-semibold tabular text-ink">{formatCents(card.commissionCents)}</span>
                          ) : null}
                          {card.followUpDate ? (
                            <span className="text-pink-deep">{relativeDays(card.followUpDate)}</span>
                          ) : null}
                        </div>

                        {canEdit ? (
                          <label className="mt-2 block">
                            <span className="sr-only">Move {card.fullName} to another stage</span>
                            <select
                              value={statusOf(card)}
                              onChange={(event) => move(card.id, event.target.value as ClientStatus)}
                              className="w-full rounded-md border border-line bg-cream-deep/60 px-2 py-1 text-xs text-ink-mute transition-colors hover:border-line-strong focus:border-pink-deep focus:outline-none focus:ring-2 focus:ring-pink/30"
                            >
                              {STATUS_ORDER.map((option) => (
                                <option key={option} value={option}>
                                  {STATUS_LABEL[option]}
                                </option>
                              ))}
                            </select>
                          </label>
                        ) : null}
                      </article>
                    </li>
                  ))
                )}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
