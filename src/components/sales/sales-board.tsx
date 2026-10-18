'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import clsx from 'clsx';
import type { ClientStatus } from '@prisma/client';
import { SALES_STAGES, SALES_STAGE_HEADING, STATUS_TONE, stageNeedsAttorney } from '@/lib/pipeline';
import { formatCents } from '@/lib/money';
import { relativeDays } from '@/lib/dates';
import { changeStatusAction } from '@/server/client-actions';
import { markCommissionPaidAction, setAttorneyAction, setExpectedRevenueAction } from '@/server/sales-actions';
import type { SalesCard } from '@/lib/queries/sales-board';

const RAIL_TONE: Record<string, string> = {
  slate: 'bg-stage-slate',
  sky: 'bg-stage-sky',
  amber: 'bg-stage-amber',
  violet: 'bg-stage-violet',
  emerald: 'bg-stage-emerald',
  rose: 'bg-stage-rose',
};

export function SalesBoard({ cards, canEdit }: { cards: SalesCard[]; canEdit: boolean }) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [dragging, setDragging] = useState<string | null>(null);
  const [hoverColumn, setHoverColumn] = useState<ClientStatus | null>(null);
  const [movingId, setMovingId] = useState<string | null>(null);
  const [optimistic, setOptimistic] = useState<Record<string, ClientStatus>>({});

  const statusOf = (card: SalesCard) => optimistic[card.id] ?? card.status;

  const run = (clientId: string, action: (fd: FormData) => Promise<void>, fields: Record<string, string>) => {
    if (!canEdit) return;
    setMovingId(clientId);
    const formData = new FormData();
    for (const [key, value] of Object.entries(fields)) formData.set(key, value);
    startTransition(async () => {
      await action(formData);
      router.refresh();
      setMovingId(null);
    });
  };

  const move = (clientId: string, status: ClientStatus) => {
    setOptimistic((current) => ({ ...current, [clientId]: status }));
    run(clientId, changeStatusAction, { clientId, status });
  };

  return (
    <div className="relative max-w-full overflow-x-auto pb-4">
      <div className="flex min-w-max gap-4">
        {SALES_STAGES.map((stage) => {
          const columnCards = cards.filter((card) => statusOf(card) === stage);
          const value = columnCards.reduce((sum, card) => sum + card.potentialRevenueCents, 0);
          const isTarget = hoverColumn === stage && dragging !== null;

          return (
            <section
              key={stage}
              aria-label={SALES_STAGE_HEADING[stage]}
              className={clsx(
                'flex w-[16.5rem] shrink-0 flex-col rounded-xl2 border bg-cream-warm/60 transition-colors duration-200',
                isTarget ? 'border-pink bg-pink-wash/60' : 'border-line',
              )}
              onDragOver={(event) => {
                if (!canEdit || !dragging) return;
                event.preventDefault();
                setHoverColumn(stage);
              }}
              onDragLeave={() => setHoverColumn((current) => (current === stage ? null : current))}
              onDrop={(event) => {
                event.preventDefault();
                setHoverColumn(null);
                const clientId = event.dataTransfer.getData('text/plain') || dragging;
                setDragging(null);
                if (clientId) move(clientId, stage);
              }}
            >
              <header className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
                <div className="min-w-0">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    <span aria-hidden className={clsx('h-3 w-[3px] rounded-full', RAIL_TONE[STATUS_TONE[stage]])} />
                    <span className="truncate">{SALES_STAGE_HEADING[stage]}</span>
                  </p>
                  <p className="mt-1 pl-[11px] text-xs text-ink-mute tabular">
                    {value > 0 ? formatCents(value) : 'No value yet'}
                  </p>
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
                          'group rounded-lg border border-line bg-cream-warm p-3 shadow-card transition-all duration-200',
                          canEdit && 'cursor-grab active:cursor-grabbing hover:-translate-y-0.5 hover:shadow-lift',
                          (dragging === card.id || movingId === card.id) && 'opacity-50',
                        )}
                      >
                        <Link href={`/clients/${card.id}`} className="block">
                          <p className="truncate text-sm font-medium text-ink">{card.fullName}</p>
                        </Link>

                        <dl className="mt-2 space-y-1 text-xs">
                          <Row label="Phone">
                            {card.phone ? (
                              <a className="link" href={`tel:${card.phone.replace(/\s/g, '')}`}>
                                {card.phone}
                              </a>
                            ) : (
                              <span className="text-ink-mute">Not recorded</span>
                            )}
                          </Row>
                          <Row label="Country">{card.countryOfBirth ?? <span className="text-ink-mute">—</span>}</Row>
                          <Row label="Revenue">
                            <span className="font-semibold tabular text-ink">
                              {card.potentialRevenueCents > 0 ? formatCents(card.potentialRevenueCents) : '—'}
                            </span>
                            {card.isEstimate && card.potentialRevenueCents > 0 ? (
                              <span className="ml-1 text-ink-mute">est.</span>
                            ) : null}
                          </Row>
                          {stageNeedsAttorney(statusOf(card)) ? (
                            <Row label="Attorney">
                              {card.attorney ?? <span className="text-ink-mute">Not set</span>}
                            </Row>
                          ) : null}
                        </dl>

                        {card.followUpDate ? (
                          <p className="mt-2 text-xs text-pink-deep">{relativeDays(card.followUpDate)}</p>
                        ) : null}

                        {canEdit ? (
                          <CardActions
                            card={card}
                            stage={statusOf(card)}
                            onMove={(status) => move(card.id, status)}
                            onSetAttorney={(attorney) => run(card.id, setAttorneyAction, { clientId: card.id, attorney })}
                            onSetRevenue={(value) =>
                              run(card.id, setExpectedRevenueAction, { clientId: card.id, potentialRevenue: value })
                            }
                            onMarkPaid={() => run(card.id, markCommissionPaidAction, { clientId: card.id })}
                          />
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <dt className="w-16 shrink-0 text-ink-mute">{label}</dt>
      <dd className="min-w-0 truncate text-ink-soft">{children}</dd>
    </div>
  );
}

function CardActions({
  card,
  stage,
  onMove,
  onSetAttorney,
  onSetRevenue,
  onMarkPaid,
}: {
  card: SalesCard;
  stage: ClientStatus;
  onMove: (status: ClientStatus) => void;
  onSetAttorney: (attorney: string) => void;
  onSetRevenue: (value: string) => void;
  onMarkPaid: () => void;
}) {
  const [editing, setEditing] = useState<'attorney' | 'revenue' | null>(null);

  if (editing === 'attorney') {
    return (
      <InlineField
        label="Attorney name"
        defaultValue={card.attorney ?? ''}
        placeholder="Ignacio Donoso"
        onCancel={() => setEditing(null)}
        onSave={(value) => {
          setEditing(null);
          onSetAttorney(value);
        }}
      />
    );
  }

  if (editing === 'revenue') {
    return (
      <InlineField
        label="Potential revenue (USD)"
        defaultValue={card.potentialRevenueCents ? String(card.potentialRevenueCents / 100) : ''}
        placeholder="40000"
        inputMode="decimal"
        onCancel={() => setEditing(null)}
        onSave={(value) => {
          setEditing(null);
          onSetRevenue(value);
        }}
      />
    );
  }

  // Always visible: on a sales board acting on a card is the main job, and
  // hiding the controls left a block of dead space in every card.
  return (
    <div className="mt-3 space-y-2 border-t border-line pt-2">
      <div className="flex flex-wrap gap-1.5">
        {card.isEstimate ? (
          <button type="button" className="btn-quiet px-2 py-1 text-xs" onClick={() => setEditing('revenue')}>
            {card.potentialRevenueCents ? 'Edit revenue' : 'Set revenue'}
          </button>
        ) : null}
        {stageNeedsAttorney(stage) ? (
          <button type="button" className="btn-quiet px-2 py-1 text-xs" onClick={() => setEditing('attorney')}>
            {card.attorney ? 'Edit attorney' : 'Add attorney'}
          </button>
        ) : null}
      </div>

      {/* Settling the commission takes the deal off the board: it is revenue now. */}
      {stage === 'I526E_FILED' && card.potentialRevenueCents > 0 && !card.isEstimate ? (
        <button
          type="button"
          className="btn-ghost w-full justify-center py-1.5 text-xs"
          onClick={() => {
            if (
              window.confirm(
                `Mark ${formatCents(card.potentialRevenueCents)} of commission paid for ${card.fullName}? ` +
                  'This records today as the payment date and removes the card from the board.',
              )
            ) {
              onMarkPaid();
            }
          }}
        >
          Commission paid
        </button>
      ) : null}

      <label className="block">
        <span className="sr-only">Move {card.fullName} to another stage</span>
        <select
          value={stage}
          onChange={(event) => onMove(event.target.value as ClientStatus)}
          className="w-full rounded-md border border-line-strong bg-cream-deep/60 px-2 py-1 text-xs text-ink-soft transition-colors hover:border-ink-soft focus:border-pink-deep"
        >
          {SALES_STAGES.map((option) => (
            <option key={option} value={option}>
              {SALES_STAGE_HEADING[option]}
            </option>
          ))}
        </select>
      </label>
    </div>
  );
}

function InlineField({
  label,
  defaultValue,
  placeholder,
  inputMode,
  onSave,
  onCancel,
}: {
  label: string;
  defaultValue: string;
  placeholder?: string;
  inputMode?: 'decimal';
  onSave: (value: string) => void;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(defaultValue);

  return (
    <div className="mt-3 border-t border-line pt-2">
      <label className="field-label">{label}</label>
      <input
        autoFocus
        value={value}
        inputMode={inputMode}
        placeholder={placeholder}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') onSave(value);
          if (event.key === 'Escape') onCancel();
        }}
        className="field py-1.5 text-xs"
      />
      <div className="mt-2 flex justify-end gap-1.5">
        <button type="button" className="btn-quiet px-2 py-1 text-xs" onClick={onCancel}>
          Cancel
        </button>
        <button type="button" className="btn-accent px-3 py-1 text-xs" onClick={() => onSave(value)}>
          Save
        </button>
      </div>
    </div>
  );
}
