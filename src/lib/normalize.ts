/**
 * Normalisers shared by the Zoho importer, the lead-capture endpoint and the CRM forms,
 * so a record created today is formatted identically to one migrated from 2019.
 */

const NAME_PARTICLES = new Set(['van', 'von', 'der', 'den', 'de', 'di', 'da', 'del', 'della', 'la', 'le', 'bin', 'binte', 'al', 'el']);

/** "ABRAHAM" -> "Abraham", "o'connor" -> "O'Connor", "POLAVARAM MUNIRATHNAM" -> "Polavaram Munirathnam". */
export function toTitleCase(input: string | null | undefined): string {
  if (!input) return '';
  const collapsed = collapseSpaces(input);
  if (!collapsed) return '';
  return collapsed
    .split(' ')
    .map((word, index) => titleCaseWord(word, index))
    .join(' ');
}

function titleCaseWord(word: string, index: number): string {
  // Keep bracketed acronyms and nicknames exactly as written, e.g. "(DJ)".
  if (/^\([A-Z0-9]{1,5}\)$/.test(word)) return word;
  const lower = word.toLowerCase();
  if (index > 0 && NAME_PARTICLES.has(lower)) return lower;
  // Preserve bracketed nicknames such as "(DJ)".
  return lower.replace(/(^|[^\p{L}'])(\p{L})/gu, (_m, prefix: string, letter: string) => prefix + letter.toUpperCase())
    .replace(/\b(Mc|Mac)(\p{Ll})/gu, (_m, prefix: string, letter: string) => prefix + letter.toUpperCase())
    .replace(/(\p{L})'(\p{Ll})/gu, (_m, before: string, letter: string) => `${before}'${letter.toUpperCase()}`);
}

export function collapseSpaces(input: string | null | undefined): string {
  if (!input) return '';
  return input.replace(/\s+/g, ' ').trim();
}

/** Strip the stray smart quotes and control characters found in the legacy export. */
export function cleanText(input: string | null | undefined): string | null {
  if (input === null || input === undefined) return null;
  const cleaned = input
    .replace(/[‘’‚‛]/g, "'")
    .replace(/[“”„]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/�/g, '')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .trim();
  return cleaned === '' ? null : cleaned;
}

export function normalizeEmail(input: string | null | undefined): string | null {
  const cleaned = cleanText(input);
  if (!cleaned) return null;
  const email = cleaned.toLowerCase().replace(/\s+/g, '');
  return isValidEmail(email) ? email : null;
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/**
 * The legacy export packs several numbers into one cell
 * ("+65 96 835 750 +65 63 367 725"). Keep the first, preserve the rest.
 */
export function normalizePhone(input: string | null | undefined): { phone: string | null; extra: string | null } {
  const cleaned = cleanText(input);
  if (!cleaned) return { phone: null, extra: null };
  const withoutLeadingJunk = cleaned.replace(/^[^+\d(]+/, '');
  const parts = withoutLeadingJunk.split(/\s(?=\+)/).map((p) => collapseSpaces(p)).filter(Boolean);
  const [first, ...rest] = parts;
  return {
    phone: first ? collapseSpaces(first) : null,
    extra: rest.length ? rest.join(' / ') : null,
  };
}

const COUNTRY_ALIASES: Record<string, string> = {
  uk: 'United Kingdom',
  'u.k.': 'United Kingdom',
  gb: 'United Kingdom',
  england: 'United Kingdom',
  britain: 'United Kingdom',
  usa: 'United States',
  us: 'United States',
  'u.s.a.': 'United States',
  uae: 'United Arab Emirates',
  dubai: 'United Arab Emirates',
  'abu dhabi': 'United Arab Emirates',
  hk: 'Hong Kong',
  'hong kong sar': 'Hong Kong',
  prc: 'China',
  roc: 'Taiwan',
  ksa: 'Saudi Arabia',
  'south korea': 'South Korea',
  'republic of ireland': 'Ireland',
};

/** Normalise country labels so "UK", "uk" and "United Kingdom" group together. */
export function normalizeCountry(input: string | null | undefined): string | null {
  const cleaned = cleanText(input);
  if (!cleaned) return null;
  const alias = COUNTRY_ALIASES[cleaned.toLowerCase()];
  if (alias) return alias;
  return toTitleCase(cleaned);
}

/** "Eb-5 Capital" / "EB-5 Capital" -> "EB-5 Capital"; "alex Example" -> "Alex Example". */
export function normalizeProperNoun(input: string | null | undefined): string | null {
  const cleaned = cleanText(input);
  if (!cleaned) return null;
  const upper = cleaned.toUpperCase();
  if (upper === 'EB-5 CAPITAL') return 'EB-5 Capital';
  if (upper === 'USIF') return 'USIF';
  if (upper === 'NONE') return null;
  // Leave mixed-case acronyms and names that already look intentional alone.
  if (/^[A-Z0-9][A-Za-z0-9'’.\- ]*$/.test(cleaned) && cleaned !== cleaned.toUpperCase()) {
    return collapseSpaces(cleaned);
  }
  return toTitleCase(cleaned);
}

export function parseBoolean(input: string | null | undefined): boolean | null {
  const cleaned = cleanText(input);
  if (!cleaned) return null;
  const lower = cleaned.toLowerCase();
  if (['true', 'yes', 'y', '1', 'paid'].includes(lower)) return true;
  if (['false', 'no', 'n', '0'].includes(lower)) return false;
  return null;
}

/** Build the display name from the legacy first/last columns. */
export function buildFullName(first: string | null | undefined, last: string | null | undefined): string {
  const parts = [toTitleCase(first), toTitleCase(last)].filter(Boolean);
  return parts.join(' ').trim();
}

/** RF-0001 style human reference. */
export function formatReference(sequence: number): string {
  return `RF-${String(sequence).padStart(4, '0')}`;
}
