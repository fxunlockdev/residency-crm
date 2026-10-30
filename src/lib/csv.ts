/**
 * CSV for a spreadsheet, and for whatever tool sends the WhatsApp broadcast
 * until the CRM can send it itself.
 *
 * Quoted defensively. A field beginning with =, +, - or @ is prefixed with a
 * tab, because Excel and Sheets treat those as formulas: a subscriber whose
 * name begins with one would otherwise become executable in someone else's
 * spreadsheet.
 */
const RISKY_FIRST_CHARACTER = /^[=+\-@\t\r]/;

/**
 * An international phone number, which begins with the `+` the guard would
 * otherwise catch. Almost every number in the list starts this way, and the
 * export exists to be imported by a broadcast tool, which would choke on a
 * leading tab. A string of digits, spaces, brackets and hyphens cannot be a
 * formula, so it needs no guard.
 */
const PLAIN_PHONE_NUMBER = /^\+\d[\d\s()-]{5,24}$/;

export function csvCell(value: string | null | undefined): string {
  const text = value ?? '';
  const risky = RISKY_FIRST_CHARACTER.test(text) && !PLAIN_PHONE_NUMBER.test(text);
  const guarded = risky ? `\t${text}` : text;
  return `"${guarded.replace(/"/g, '""')}"`;
}

export function csvRow(cells: Array<string | null | undefined>): string {
  return cells.map(csvCell).join(',');
}

/** CRLF, which is what RFC 4180 asks for and what Excel expects. */
export function csvDocument(header: string[], rows: Array<Array<string | null | undefined>>): string {
  return [csvRow(header), ...rows.map(csvRow)].join('\r\n') + '\r\n';
}
