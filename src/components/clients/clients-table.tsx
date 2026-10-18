import Link from 'next/link';
import clsx from 'clsx';
import type { ClientStatus, LeadSource } from '@prisma/client';
import { StatusChip, SourceChip } from '@/components/ui/chips';
import { NotesCell } from '@/components/clients/notes-cell';
import { ColumnResizer } from '@/components/clients/resizable-table';
import { PINNED_COLUMN, columnDef, widthFor } from '@/lib/table-columns';
import { formatCents } from '@/lib/money';
import { daysUntil, formatDate } from '@/lib/dates';

export type ClientRow = {
  id: string;
  reference: string;
  fullName: string;
  email: string | null;
  secondaryEmail?: string | null;
  phone: string | null;
  countryOfBirth: string | null;
  countryOfResidence: string | null;
  status: ClientStatus;
  source: LeadSource;
  followUpDate: Date | null;
  nextAction: string | null;
  notes: string | null;
  attorney: string | null;
  caseWorker: string | null;
  i526eFiledDate: Date | null;
  i526eApprovedDate: Date | null;
  i526eReceiptNumber: string | null;
  dateFunded: Date | null;
  investmentAmountCents: number | null;
  marketingConsent: boolean;
  spouseOrParent: string | null;
  adminFeeCents: number | null;
  pmFeeCents: number | null;
  updatedAt: Date;
  regionalCentre: { name: string } | null;
  project: { name: string } | null;
  owner: { name: string } | null;
  _count: { meetings: number };
  commissions: Array<{ amountCents: number; status: string }>;
};

/**
 * A spreadsheet-shaped view of the book.
 *
 * `table-layout: fixed` plus a <colgroup> is what makes per-column widths
 * actually hold. The client column is sticky, so it stays readable however far
 * right the others scroll — and the scroll only appears when the chosen
 * columns are wider than the screen.
 */
export function ClientsTable({
  rows,
  columns,
  widths,
}: {
  rows: ClientRow[];
  columns: string[];
  widths: Record<string, number>;
}) {
  const pinnedWidth = widthFor(PINNED_COLUMN.key, widths);

  return (
    <div className="surface overflow-hidden">
      <div className="overflow-x-auto">
        <table className="data-table w-max min-w-full table-fixed">
          <caption className="sr-only">
            Clients matching the current filters. The client column stays in place while the rest scroll.
          </caption>

          <colgroup>
            <col data-column-index={0} style={{ width: `${pinnedWidth}px` }} />
            {columns.map((key, index) => (
              <col key={key} data-column-index={index + 1} style={{ width: `${widthFor(key, widths)}px` }} />
            ))}
          </colgroup>

          <thead>
            <tr>
              <th scope="col" className="col-pinned bg-cream-deep">
                <span className="relative block pr-2">
                  {PINNED_COLUMN.label}
                  <ColumnResizer columnKey={PINNED_COLUMN.key} index={0} />
                </span>
              </th>
              {columns.map((key, index) => {
                const def = columnDef(key);
                return (
                  <th key={key} scope="col" className={clsx(def?.align === 'right' && 'text-right')}>
                    <span className="relative block pr-2">
                      {def?.label ?? key}
                      <ColumnResizer columnKey={key} index={index + 1} />
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <th scope="row" className="col-pinned text-left">
                  <Link href={`/clients/${row.id}`} className="group block">
                    <span className="block truncate font-medium text-ink group-hover:text-pink-deep">
                      {row.fullName}
                    </span>
                    <span className="mt-0.5 block truncate text-xs text-ink-mute tabular">{row.reference}</span>
                  </Link>
                </th>

                {columns.map((key) => (
                  <td key={key} className={clsx('align-top', columnDef(key)?.align === 'right' && 'text-right')}>
                    <Cell column={key} row={row} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Cell({ column, row }: { column: string; row: ClientRow }) {
  const dash = <span className="text-ink-mute">—</span>;
  const text = (value: string | null | undefined) =>
    value ? <span className="block truncate text-ink-soft">{value}</span> : dash;

  const commissionTotal = row.commissions.reduce((sum, c) => sum + c.amountCents, 0);
  const outstanding = row.commissions
    .filter((c) => c.status !== 'PAID')
    .reduce((sum, c) => sum + c.amountCents, 0);

  switch (column) {
    case 'stage':
      return <StatusChip status={row.status} />;
    case 'source':
      return <SourceChip source={row.source} />;
    case 'countryOfBirth':
      return text(row.countryOfBirth);
    case 'countryOfResidence':
      return text(row.countryOfResidence);
    case 'phone':
      return row.phone ? (
        <a className="link block truncate" href={`tel:${row.phone.replace(/\s/g, '')}`}>
          {row.phone}
        </a>
      ) : (
        dash
      );
    case 'email':
      return row.email ? (
        <a className="link block truncate" href={`mailto:${row.email}`}>
          {row.email}
        </a>
      ) : (
        dash
      );
    case 'project':
      return text(row.project?.name);
    case 'regionalCentre':
      return text(row.regionalCentre?.name);
    case 'attorney':
      return text(row.attorney);
    case 'caseWorker':
      return text(row.caseWorker);
    case 'commission':
      return <span className="block tabular">{commissionTotal ? formatCents(commissionTotal) : dash}</span>;
    case 'outstanding':
      return outstanding > 0 ? (
        <span className="block tabular text-stage-amber">{formatCents(outstanding)}</span>
      ) : commissionTotal > 0 ? (
        <span className="block text-xs text-stage-emerald">Settled</span>
      ) : (
        dash
      );
    case 'investment':
      return <span className="block tabular">{row.investmentAmountCents ? formatCents(row.investmentAmountCents) : dash}</span>;
    case 'dateFunded':
      return <span className="block whitespace-nowrap tabular text-ink-soft">{formatDate(row.dateFunded)}</span>;
    case 'i526eFiledDate':
      return <span className="block whitespace-nowrap tabular text-ink-soft">{formatDate(row.i526eFiledDate)}</span>;
    case 'i526eApprovedDate':
      return <span className="block whitespace-nowrap tabular text-ink-soft">{formatDate(row.i526eApprovedDate)}</span>;
    case 'i526eReceiptNumber':
      return text(row.i526eReceiptNumber);
    case 'followUpDate':
      return row.followUpDate ? (
        <span
          className={clsx(
            'block whitespace-nowrap tabular',
            (daysUntil(row.followUpDate) ?? 1) <= 0 ? 'font-medium text-pink-deep' : 'text-ink-soft',
          )}
        >
          {formatDate(row.followUpDate)}
        </span>
      ) : (
        dash
      );
    case 'nextAction':
      return text(row.nextAction);
    case 'notes':
      return <NotesCell notes={row.notes} />;
    case 'meetings':
      return <span className="block tabular text-ink-soft">{row._count.meetings}</span>;
    case 'owner':
      return text(row.owner?.name);
    case 'marketingConsent':
      return row.marketingConsent ? (
        <span className="chip border-stage-emerald/25 bg-stage-emerald/10 text-stage-emerald">Given</span>
      ) : (
        <span className="chip border-line bg-cream-deep text-ink-mute">No</span>
      );
    case 'spouseOrParent':
      return text(row.spouseOrParent);
    case 'adminFee':
      return <span className="block tabular">{row.adminFeeCents ? formatCents(row.adminFeeCents) : dash}</span>;
    case 'pmFee':
      return <span className="block tabular">{row.pmFeeCents ? formatCents(row.pmFeeCents) : dash}</span>;
    case 'updatedAt':
      return <span className="block whitespace-nowrap tabular text-ink-mute">{formatDate(row.updatedAt)}</span>;
    default:
      return dash;
  }
}
