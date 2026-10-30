/**
 * A URL segment from a headline.
 *
 * Shared by the editor, which suggests one as the author types, and the
 * server, which has no reason to trust that suggestion. Kept out of
 * `markdown.ts` because that module is server-only and this runs in the
 * browser too.
 */
export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80)
    .replace(/-+$/g, '');
}
