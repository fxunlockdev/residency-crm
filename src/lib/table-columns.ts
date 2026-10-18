/**
 * The column catalogue for the clients table.
 *
 * Everything here can be turned on, reordered and resized per user, so two
 * people can read the same book differently — one as a sales list, one as a
 * spreadsheet. The client name column is pinned: it is the row's identity and
 * stays visible while the rest scrolls sideways.
 */
export type ColumnAlign = 'left' | 'right';

export type ColumnDef = {
  key: string;
  label: string;
  /** Default width in pixels. */
  width: number;
  align?: ColumnAlign;
  /** Short note shown in the column picker. */
  hint?: string;
};

/** Always first, always present, frozen during horizontal scroll. */
export const PINNED_COLUMN: ColumnDef = {
  key: 'client',
  label: 'Client',
  width: 240,
};

export const AVAILABLE_COLUMNS: ColumnDef[] = [
  { key: 'stage', label: 'Stage', width: 150 },
  { key: 'source', label: 'Source', width: 130 },
  { key: 'countryOfBirth', label: 'Country of birth', width: 150, hint: 'Drives visa chargeability' },
  { key: 'countryOfResidence', label: 'Country of residence', width: 160 },
  { key: 'phone', label: 'Phone', width: 150 },
  { key: 'email', label: 'Email', width: 200 },
  { key: 'project', label: 'Project', width: 180 },
  { key: 'regionalCentre', label: 'Regional centre', width: 140 },
  { key: 'attorney', label: 'Attorney', width: 150 },
  { key: 'caseWorker', label: 'Case worker', width: 140 },
  { key: 'commission', label: 'Commission', width: 130, align: 'right' },
  { key: 'outstanding', label: 'Outstanding', width: 130, align: 'right' },
  { key: 'investment', label: 'Investment', width: 130, align: 'right' },
  { key: 'dateFunded', label: 'Funded', width: 120 },
  { key: 'i526eFiledDate', label: 'I-526E filed', width: 120 },
  { key: 'i526eApprovedDate', label: 'I-526E approved', width: 140 },
  { key: 'i526eReceiptNumber', label: 'Receipt number', width: 150 },
  { key: 'followUpDate', label: 'Follow-up', width: 130 },
  { key: 'nextAction', label: 'Next action', width: 200 },
  { key: 'notes', label: 'Notes', width: 220, hint: 'Hover a cell to read the whole note' },
  { key: 'meetings', label: 'Meetings', width: 100, align: 'right' },
  { key: 'owner', label: 'Owner', width: 140 },
  { key: 'marketingConsent', label: 'Marketing consent', width: 150 },
  { key: 'spouseOrParent', label: 'Spouse / parent', width: 160, hint: 'From the legacy export' },
  { key: 'adminFee', label: 'Admin fee', width: 130, align: 'right', hint: 'From the legacy export' },
  { key: 'pmFee', label: 'Fee paid to PM', width: 140, align: 'right', hint: 'From the legacy export' },
  { key: 'updatedAt', label: 'Last updated', width: 130 },
];

/** What a new user sees before they change anything. */
export const DEFAULT_COLUMNS = [
  'stage',
  'countryOfBirth',
  'project',
  'commission',
  'i526eFiledDate',
  'followUpDate',
];

const BY_KEY = new Map([PINNED_COLUMN, ...AVAILABLE_COLUMNS].map((column) => [column.key, column]));

export function columnDef(key: string): ColumnDef | undefined {
  return BY_KEY.get(key);
}

/**
 * Cleans a stored preference: drops columns that no longer exist, removes
 * duplicates, and never lets the pinned column be listed twice.
 */
export function resolveColumns(stored: unknown): string[] {
  const candidate = Array.isArray(stored) ? stored : DEFAULT_COLUMNS;
  const seen = new Set<string>();
  const resolved: string[] = [];
  for (const key of candidate) {
    if (typeof key !== 'string') continue;
    if (key === PINNED_COLUMN.key) continue;
    if (!BY_KEY.has(key) || seen.has(key)) continue;
    seen.add(key);
    resolved.push(key);
  }
  return resolved.length > 0 ? resolved : DEFAULT_COLUMNS;
}

export const MIN_COLUMN_WIDTH = 80;
export const MAX_COLUMN_WIDTH = 600;

/** Clamps stored widths so a bad value cannot make a column unusable. */
export function resolveWidths(stored: unknown): Record<string, number> {
  const widths: Record<string, number> = {};
  if (!stored || typeof stored !== 'object') return widths;
  for (const [key, value] of Object.entries(stored as Record<string, unknown>)) {
    if (!BY_KEY.has(key)) continue;
    const width = Number(value);
    if (!Number.isFinite(width)) continue;
    widths[key] = Math.min(MAX_COLUMN_WIDTH, Math.max(MIN_COLUMN_WIDTH, Math.round(width)));
  }
  return widths;
}

export function widthFor(key: string, widths: Record<string, number>): number {
  return widths[key] ?? columnDef(key)?.width ?? 150;
}
