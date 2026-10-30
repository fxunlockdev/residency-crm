import 'server-only';
import { Marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { markdownToPlainText } from './markdown';

/**
 * The newsletter sent to the EB-5 updates list.
 *
 * Same house style as the transactional mail: navy, mint, teal and ivory,
 * tables for layout, every style inline and no webfont. The body is longer
 * than an alert, so it gets its own shell rather than being forced through
 * the label-and-value layout of `email-template`.
 */

const NAVY = '#102c38';
const INK = '#173641';
const MINT = '#9cddd6';
const TEAL = '#16736e';
const IVORY = '#f7f7f0';
const MUTED = '#52646b';
const LINE = '#d6dfdc';

const SERIF = "Caslon, Georgia, 'Times New Roman', serif";
const SANS = "DM, -apple-system, 'Segoe UI', Arial, sans-serif";

const marked = new Marked({ gfm: true, breaks: false, async: false });

export type Newsletter = {
  subject: string;
  preheader?: string | null;
  bodyMarkdown: string;
  /** This subscriber's own link. Never shared between recipients. */
  unsubscribeUrl: string;
};

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Markdown to email HTML.
 *
 * Sanitised first, then styled by rewriting the opening tags. Mail clients
 * strip stylesheets and ignore most selectors, so every rule has to live on
 * the element. Rewriting known-good tags after sanitising is deliberate: the
 * set of tags that can appear is closed, so the replacements are exhaustive.
 */
export function renderBodyForEmail(markdown: string): string {
  const clean = sanitizeHtml(marked.parse(markdown) as string, {
    allowedTags: ['p', 'h2', 'h3', 'ul', 'ol', 'li', 'strong', 'em', 'a', 'blockquote', 'br', 'hr'],
    allowedAttributes: { a: ['href'] },
    allowedSchemes: ['http', 'https', 'mailto', 'tel'],
    // Parity with the article renderer: `//evil.example` is not a path.
    allowProtocolRelative: false,
  });

  return clean
    .replace(/<h2>/g, `<h2 style="margin:30px 0 0;font:400 21px/1.3 ${SERIF};color:${NAVY};">`)
    .replace(/<h3>/g, `<h3 style="margin:24px 0 0;font:400 17px/1.35 ${SERIF};color:${NAVY};">`)
    .replace(/<p>/g, `<p style="margin:14px 0 0;font:400 16px/1.65 ${SANS};color:${INK};">`)
    .replace(/<ul>/g, `<ul style="margin:14px 0 0;padding-left:20px;">`)
    .replace(/<ol>/g, `<ol style="margin:14px 0 0;padding-left:20px;">`)
    .replace(/<li>/g, `<li style="margin:6px 0 0;font:400 16px/1.6 ${SANS};color:${INK};">`)
    .replace(
      /<blockquote>/g,
      `<blockquote style="margin:18px 0 0;padding:2px 0 2px 16px;border-left:3px solid ${MINT};font:400 16px/1.6 ${SANS};color:${MUTED};">`,
    )
    .replace(/<hr\s*\/?>/g, `<div style="height:1px;margin:26px 0 0;background:${LINE};font-size:0;line-height:0;">&nbsp;</div>`)
    .replace(/<a /g, `<a style="color:${TEAL};text-decoration:underline;" `);
}

export function renderNewsletterHtml(letter: Newsletter): string {
  const preview = letter.preheader?.trim() || letter.subject;
  const unsubscribe = escapeHtml(letter.unsubscribeUrl);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(letter.subject)}</title>
</head>
<body style="margin:0;padding:0;background:${IVORY};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preview)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${IVORY};">
  <tr>
    <td align="center" style="padding:32px 16px;">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid ${LINE};">

        <tr>
          <td style="background:${NAVY};padding:26px 36px;">
            <div style="font:400 15px/1 ${SERIF};letter-spacing:.22em;text-transform:uppercase;color:#ffffff;">
              Residency First
            </div>
            <div style="height:7px;"></div>
            <div style="font:400 9px/1 ${SANS};letter-spacing:.42em;text-transform:uppercase;color:${MINT};">
              Advisers
            </div>
          </td>
        </tr>
        <tr><td style="height:3px;background:${MINT};font-size:0;line-height:0;">&nbsp;</td></tr>

        <tr>
          <td style="padding:38px 36px 0;">
            <div style="font:400 11px/1 ${SANS};letter-spacing:.14em;text-transform:uppercase;color:${TEAL};">
              EB-5 updates
            </div>
            <h1 style="margin:14px 0 0;font:400 28px/1.22 ${SERIF};color:${NAVY};">
              ${escapeHtml(letter.subject)}
            </h1>
          </td>
        </tr>

        <tr>
          <td style="padding:8px 36px 0;">
            ${renderBodyForEmail(letter.bodyMarkdown)}
          </td>
        </tr>

        <tr>
          <td style="padding:34px 36px 32px;">
            <div style="height:1px;background:${LINE};font-size:0;line-height:0;">&nbsp;</div>
            <p style="margin:18px 0 0;font:400 12px/1.6 ${SANS};color:${MUTED};">
              You are receiving this because you asked for EB-5 deadline updates at residencyfirst.com.
              General information, not legal or investment advice.
            </p>
            <p style="margin:10px 0 0;font:400 12px/1.6 ${SANS};color:${MUTED};">
              <a href="${unsubscribe}" style="color:${MUTED};text-decoration:underline;">Unsubscribe</a>
            </p>
          </td>
        </tr>

      </table>
    </td>
  </tr>
</table>
</body>
</html>`;
}

/** The same newsletter as plain text, for clients that will not render HTML. */
export function renderNewsletterText(letter: Newsletter): string {
  return [
    letter.subject,
    '',
    markdownToPlainText(letter.bodyMarkdown),
    '',
    '—',
    'You are receiving this because you asked for EB-5 deadline updates at residencyfirst.com.',
    'General information, not legal or investment advice.',
    `Unsubscribe: ${letter.unsubscribeUrl}`,
  ].join('\n');
}
