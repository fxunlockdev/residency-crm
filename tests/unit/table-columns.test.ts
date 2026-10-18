import { describe, expect, it } from 'vitest';
import {
  AVAILABLE_COLUMNS,
  DEFAULT_COLUMNS,
  MAX_COLUMN_WIDTH,
  MIN_COLUMN_WIDTH,
  PINNED_COLUMN,
  columnDef,
  resolveColumns,
  resolveWidths,
  widthFor,
} from '@/lib/table-columns';

describe('resolveColumns', () => {
  it('keeps a valid selection in the order the user set', () => {
    expect(resolveColumns(['notes', 'stage', 'phone'])).toEqual(['notes', 'stage', 'phone']);
  });

  it('falls back to the default view when nothing is stored', () => {
    expect(resolveColumns(undefined)).toEqual(DEFAULT_COLUMNS);
    expect(resolveColumns(null)).toEqual(DEFAULT_COLUMNS);
    expect(resolveColumns('not an array')).toEqual(DEFAULT_COLUMNS);
  });

  it('drops columns that no longer exist rather than rendering a blank one', () => {
    expect(resolveColumns(['stage', 'a-column-we-removed', 'phone'])).toEqual(['stage', 'phone']);
  });

  it('never lets the pinned column be listed twice', () => {
    // It is rendered separately and always first.
    expect(resolveColumns([PINNED_COLUMN.key, 'stage'])).toEqual(['stage']);
  });

  it('removes duplicates', () => {
    expect(resolveColumns(['stage', 'stage', 'phone'])).toEqual(['stage', 'phone']);
  });

  it('falls back rather than leaving the table with no columns at all', () => {
    expect(resolveColumns([])).toEqual(DEFAULT_COLUMNS);
    expect(resolveColumns(['nonsense'])).toEqual(DEFAULT_COLUMNS);
    expect(resolveColumns([PINNED_COLUMN.key])).toEqual(DEFAULT_COLUMNS);
  });
});

describe('resolveWidths', () => {
  it('keeps sensible widths', () => {
    expect(resolveWidths({ stage: 200, phone: 120 })).toEqual({ stage: 200, phone: 120 });
  });

  it('clamps a width that would make a column unusable', () => {
    expect(resolveWidths({ stage: 1 }).stage).toBe(MIN_COLUMN_WIDTH);
    expect(resolveWidths({ stage: 99_999 }).stage).toBe(MAX_COLUMN_WIDTH);
  });

  it('ignores junk instead of producing NaN widths', () => {
    expect(resolveWidths({ stage: 'wide' })).toEqual({});
    expect(resolveWidths({ stage: Number.NaN })).toEqual({});
    expect(resolveWidths(null)).toEqual({});
    expect(resolveWidths('nope')).toEqual({});
  });

  it('ignores widths for columns that no longer exist', () => {
    expect(resolveWidths({ 'a-column-we-removed': 200 })).toEqual({});
  });

  it('allows a width for the pinned column, which is resizable too', () => {
    expect(resolveWidths({ [PINNED_COLUMN.key]: 300 })).toEqual({ [PINNED_COLUMN.key]: 300 });
  });
});

describe('widthFor', () => {
  it('prefers the saved width, then the column default', () => {
    expect(widthFor('stage', { stage: 222 })).toBe(222);
    expect(widthFor('stage', {})).toBe(columnDef('stage')!.width);
  });

  it('still returns something usable for an unknown column', () => {
    expect(widthFor('unknown', {})).toBeGreaterThan(0);
  });
});

describe('the column catalogue', () => {
  it('has no duplicate keys', () => {
    const keys = [PINNED_COLUMN, ...AVAILABLE_COLUMNS].map((c) => c.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('offers every default column', () => {
    for (const key of DEFAULT_COLUMNS) expect(columnDef(key)).toBeDefined();
  });

  it('gives every column a label and a workable default width', () => {
    for (const column of [PINNED_COLUMN, ...AVAILABLE_COLUMNS]) {
      expect(column.label.length).toBeGreaterThan(0);
      expect(column.width).toBeGreaterThanOrEqual(MIN_COLUMN_WIDTH);
      expect(column.width).toBeLessThanOrEqual(MAX_COLUMN_WIDTH);
    }
  });
});
