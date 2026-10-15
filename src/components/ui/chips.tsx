import clsx from 'clsx';
import type { ClientStatus, CommissionStatus, LeadSource } from '@prisma/client';
import { STATUS_SHORT_LABEL, STATUS_TONE } from '@/lib/pipeline';
import { COMMISSION_STATUS_LABEL, SOURCE_LABEL } from '@/lib/labels';

const TONE_CLASS: Record<string, string> = {
  slate: 'border-stage-slate/25 bg-stage-slate/10 text-stage-slate',
  sky: 'border-stage-sky/25 bg-stage-sky/10 text-stage-sky',
  amber: 'border-stage-amber/30 bg-stage-amber/12 text-stage-amber',
  violet: 'border-stage-violet/25 bg-stage-violet/10 text-stage-violet',
  emerald: 'border-stage-emerald/25 bg-stage-emerald/10 text-stage-emerald',
  rose: 'border-stage-rose/25 bg-stage-rose/10 text-stage-rose',
};

export function StatusChip({ status, className }: { status: ClientStatus; className?: string }) {
  return (
    <span className={clsx('chip', TONE_CLASS[STATUS_TONE[status]], className)}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
      {STATUS_SHORT_LABEL[status]}
    </span>
  );
}

const COMMISSION_TONE: Record<CommissionStatus, string> = {
  NOT_DUE: 'border-line bg-cream-deep text-ink-mute',
  DUE: 'border-stage-amber/30 bg-stage-amber/12 text-stage-amber',
  INVOICED: 'border-stage-sky/25 bg-stage-sky/10 text-stage-sky',
  PAID: 'border-stage-emerald/25 bg-stage-emerald/10 text-stage-emerald',
  DISPUTED: 'border-stage-rose/30 bg-stage-rose/10 text-stage-rose',
};

export function CommissionChip({ status, overdue }: { status: CommissionStatus; overdue?: boolean }) {
  if (overdue) {
    return (
      <span className="chip border-stage-rose/35 bg-stage-rose/12 text-stage-rose">
        <span className="h-1.5 w-1.5 rounded-full bg-current" aria-hidden />
        Overdue
      </span>
    );
  }
  return <span className={clsx('chip', COMMISSION_TONE[status])}>{COMMISSION_STATUS_LABEL[status]}</span>;
}

export function SourceChip({ source }: { source: LeadSource }) {
  const accent = source === 'GOOGLE_ADS' ? 'border-pink/35 bg-pink-wash text-pink-deep' : 'border-line bg-cream-deep text-ink-mute';
  return <span className={clsx('chip', accent)}>{SOURCE_LABEL[source]}</span>;
}

export function CountryChip({ country, flagged }: { country: string | null; flagged?: boolean }) {
  if (!country) return <span className="text-ink-mute">—</span>;
  if (!flagged) return <span>{country}</span>;
  return (
    <span className="inline-flex items-center gap-1.5">
      {country}
      <span
        className="chip border-stage-amber/30 bg-stage-amber/12 px-1.5 py-0.5 text-[0.625rem] text-stage-amber"
        title="Longer Visa Bulletin wait under country chargeability"
      >
        Retrogression
      </span>
    </span>
  );
}
