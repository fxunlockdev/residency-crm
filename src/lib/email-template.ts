import 'server-only';

/**
 * The house style for mail the CRM sends, matching the marketing site:
 * navy #102c38, mint #9cddd6, teal #16736e, ivory #f7f7f0.
 *
 * Written the way email has to be written, not the way the web is: tables for
 * layout, every style inline, no external stylesheet, and no webfont. Caslon
 * and DM are self-hosted on the site and will not load in a mail client, so
 * the stacks fall back to Georgia and Arial, which are close enough in weight
 * and width that the layout does not move.
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

export type Row = { label: string; value: string };

export type Email = {
  /** Small caps line above the heading. */
  eyebrow: string;
  heading: string;
  /** One sentence under the heading. */
  intro?: string;
  rows?: Row[];
  /** The visitor's own words, set apart from our summary of them. */
  quote?: { label: string; text: string };
  reference?: string;
  cta?: { label: string; href: string };
  footnote?: string;
};

/** Everything that reaches here is visitor-supplied, so nothing is trusted. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Only http(s) survives, so a quoted link can never become javascript:. */
function safeHref(href: string): string | null {
  try {
    const url = new URL(href);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.toString() : null;
  } catch {
    return null;
  }
}

/**
 * Label beside value, not above it. Stacking nine rows made the alert three
 * screens long on a phone; the reader wants to scan it in one glance.
 * `width` on the label cell, rather than a CSS grid, because Outlook.
 */
function renderRows(rows: Row[]): string {
  return rows
    .map(
      ({ label, value }, index) => `
        <tr>
          <td width="96" valign="top" style="width:96px;padding:${index === 0 ? '0' : '11px'} 14px 0 0;font:400 11px/1.6 ${SANS};letter-spacing:.09em;text-transform:uppercase;color:${MUTED};">
            ${escapeHtml(label)}
          </td>
          <td valign="top" style="padding:${index === 0 ? '0' : '11px'} 0 0;font:400 16px/1.45 ${SANS};color:${INK};word-break:break-word;">
            ${escapeHtml(value)}
          </td>
        </tr>`,
    )
    .join('');
}

export function renderEmailHtml(email: Email): string {
  const cta = email.cta && safeHref(email.cta.href) ? { ...email.cta, href: safeHref(email.cta.href)! } : null;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<title>${escapeHtml(email.heading)}</title>
</head>
<body style="margin:0;padding:0;background:${IVORY};-webkit-text-size-adjust:100%;">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(email.intro ?? email.heading)}</div>
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
              ${escapeHtml(email.eyebrow)}
            </div>
            <h1 style="margin:14px 0 0;font:400 30px/1.2 ${SERIF};color:${NAVY};">
              ${escapeHtml(email.heading)}
            </h1>
            ${
              email.intro
                ? `<p style="margin:14px 0 0;font:400 16px/1.6 ${SANS};color:${MUTED};">${escapeHtml(email.intro)}</p>`
                : ''
            }
          </td>
        </tr>

        ${
          email.rows && email.rows.length > 0
            ? `<tr>
          <td style="padding:30px 36px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
              ${renderRows(email.rows)}
            </table>
          </td>
        </tr>`
            : ''
        }

        ${
          email.quote
            ? `<tr>
          <td style="padding:8px 36px 0;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${IVORY};border-left:3px solid ${MINT};">
              <tr>
                <td style="padding:20px 22px;">
                  <div style="font:400 11px/1.4 ${SANS};letter-spacing:.09em;text-transform:uppercase;color:${MUTED};">
                    ${escapeHtml(email.quote.label)}
                  </div>
                  <div style="height:8px;"></div>
                  <div style="font:400 16px/1.65 ${SERIF};color:${INK};white-space:pre-wrap;word-break:break-word;">${escapeHtml(email.quote.text)}</div>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
            : ''
        }

        ${
          email.reference
            ? `<tr>
          <td style="padding:26px 36px 0;">
            <span style="display:inline-block;padding:7px 13px;background:${IVORY};border:1px solid ${LINE};font:400 13px/1 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace;letter-spacing:.06em;color:${INK};">
              ${escapeHtml(email.reference)}
            </span>
            <span style="font:400 12px/1 ${SANS};color:${MUTED};padding-left:10px;">quoted to the sender</span>
          </td>
        </tr>`
            : ''
        }

        ${
          cta
            ? `<tr>
          <td style="padding:30px 36px 0;">
            <table role="presentation" cellpadding="0" cellspacing="0" border="0">
              <tr>
                <td style="background:${TEAL};">
                  <a href="${escapeHtml(cta.href)}" style="display:inline-block;padding:14px 28px;font:400 15px/1 ${SANS};color:#ffffff;text-decoration:none;letter-spacing:.02em;">
                    ${escapeHtml(cta.label)} &rarr;
                  </a>
                </td>
              </tr>
            </table>
          </td>
        </tr>`
            : ''
        }

        <tr>
          <td style="padding:34px 36px 32px;">
            <div style="height:1px;background:${LINE};font-size:0;line-height:0;">&nbsp;</div>
            <p style="margin:18px 0 0;font:400 12px/1.6 ${SANS};color:${MUTED};">
              ${escapeHtml(email.footnote ?? 'Sent by the Residency First EB-5 tracker.')}
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

/** The same content as plain text, for clients that will not render HTML. */
export function renderEmailText(email: Email): string {
  const lines: string[] = [email.eyebrow.toUpperCase(), '', email.heading];
  if (email.intro) lines.push('', email.intro);

  if (email.rows && email.rows.length > 0) {
    lines.push('');
    const width = Math.max(...email.rows.map((row) => row.label.length));
    for (const row of email.rows) lines.push(`${row.label.padEnd(width)}  ${row.value}`);
  }

  if (email.quote) lines.push('', `${email.quote.label}:`, '', email.quote.text);
  if (email.reference) lines.push('', `Reference quoted to the sender: ${email.reference}`);
  if (email.cta) lines.push('', `${email.cta.label}: ${email.cta.href}`);
  lines.push('', email.footnote ?? 'Sent by the Residency First EB-5 tracker.');

  return lines.join('\n');
}
