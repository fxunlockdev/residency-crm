import 'server-only';
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';

export { slugify } from './slug';

/**
 * Author markdown turned into the markup the public site already uses.
 *
 * Rendered here rather than on the website so there is exactly one parser in
 * the system and the website never has to trust, or parse, author input: it
 * receives HTML this app produced and sanitised, and inserts it verbatim.
 *
 * Sanitising after rendering is not redundant with the site's CSP. The CSP
 * stops a script running; the allowlist stops an element reaching the page at
 * all, which also covers iframes, forms and style attributes that would
 * quietly break the design.
 */

const marked = new Marked({ gfm: true, breaks: false, async: false });

/** Everything the design's article body actually uses, and nothing else. */
const ALLOWED_TAGS = [
  'p',
  'h2',
  'h3',
  'h4',
  'ul',
  'ol',
  'li',
  'strong',
  'em',
  'a',
  'blockquote',
  'table',
  'thead',
  'tbody',
  'tr',
  'th',
  'td',
  'code',
  'pre',
  'br',
  'hr',
];

export type RenderedArticle = { html: string; headings: string[] };

export function renderArticleHtml(markdown: string): RenderedArticle {
  const headings: string[] = [];
  let sectionIndex = 0;

  const raw = marked.parse(markdown) as string;

  const clean = sanitizeHtml(raw, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      a: ['href', 'rel', 'target'],
      th: ['scope'],
      h2: ['id'],
    },
    // Anything else is a protocol we have no reason to emit.
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // A link with no scheme at all is a site-relative path, which is fine.
    allowProtocolRelative: false,
    transformTags: {
      h2: (tagName, attribs) => {
        sectionIndex += 1;
        return { tagName, attribs: { ...attribs, id: `page-section-${sectionIndex}` } };
      },
      a: (tagName, attribs) => {
        const href = attribs.href ?? '';
        // Only a link leaving the site opens in a new tab. Doing it to
        // internal links strands the reader in a pile of windows.
        if (!/^https?:\/\//i.test(href)) return { tagName, attribs };
        return { tagName, attribs: { ...attribs, target: '_blank', rel: 'noopener noreferrer' } };
      },
    },
  });

  // Collected after sanitising, so the list matches what actually shipped.
  for (const match of clean.matchAll(/<h2 id="(page-section-\d+)">(.*?)<\/h2>/gs)) {
    headings.push(stripTags(match[2] ?? ''));
  }

  return { html: wrapTables(withColumnScopes(clean)), headings };
}

/**
 * The design scrolls wide tables inside a focusable region rather than
 * letting them widen the page on a phone. Markdown has no way to say that, so
 * every table gets the treatment.
 */
function wrapTables(html: string): string {
  return html.replace(
    /<table>[\s\S]*?<\/table>/g,
    (table) => `<div class="table-wrap" role="region" aria-label="Scrollable table" tabindex="0">${table}</div>`,
  );
}

/**
 * The shipped tables mark their header cells, and a screen reader needs it to
 * read a cell back with its column. Markdown has no syntax for it, so every
 * `thead` cell gets `scope="col"`.
 */
function withColumnScopes(html: string): string {
  return html.replace(/<thead>[\s\S]*?<\/thead>/g, (head) => head.replace(/<th>/g, '<th scope="col">'));
}

function stripTags(value: string): string {
  return value.replace(/<[^>]*>/g, '').trim();
}

/**
 * A readable plain-text alternative, for the text part of an email. Mail
 * clients that refuse HTML still get the whole article.
 */
export function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '$1 ($2)')
    .replace(/(\*\*|__)(.*?)\1/g, '$2')
    .replace(/(\*|_)(.*?)\1/g, '$2')
    .replace(/^>\s?/gm, '')
    .replace(/^[-*+]\s+/gm, '· ')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

