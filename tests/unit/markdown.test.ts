import { describe, expect, it } from 'vitest';
import { markdownToPlainText, renderArticleHtml, slugify } from '@/lib/markdown';
import { renderBodyForEmail } from '@/lib/newsletter-template';

describe('renderArticleHtml', () => {
  it('numbers section headings the way the published pages do', () => {
    const { html, headings } = renderArticleHtml('## First\n\nBody.\n\n## Second\n\nMore.');
    expect(html).toContain('<h2 id="page-section-1">First</h2>');
    expect(html).toContain('<h2 id="page-section-2">Second</h2>');
    expect(headings).toEqual(['First', 'Second']);
  });

  it('strips a script tag rather than escaping it into the page', () => {
    const { html } = renderArticleHtml('Before\n\n<script>alert(1)</script>\n\nAfter');
    expect(html).not.toContain('script');
    expect(html).toContain('Before');
    expect(html).toContain('After');
  });

  it('removes a javascript: link but keeps the words around it', () => {
    const { html } = renderArticleHtml('Read [this](javascript:alert(1)) now.');
    expect(html).not.toContain('javascript:');
    expect(html).toContain('this');
  });

  it('drops an image, which the design has no slot for inside an article', () => {
    const { html } = renderArticleHtml('Text\n\n![alt](/assets/anything.webp)\n\nMore');
    expect(html).not.toContain('<img');
  });

  it('drops an inline style attribute, which would break the design quietly', () => {
    const { html } = renderArticleHtml('<p style="font-size:90px">Loud</p>');
    expect(html).not.toContain('style=');
    expect(html).toContain('Loud');
  });

  it('opens outbound links in a new tab, and leaves internal links alone', () => {
    const { html } = renderArticleHtml('[USCIS](https://www.uscis.gov/) and [our guide](/resources/).');
    expect(html).toContain('href="https://www.uscis.gov/" target="_blank" rel="noopener noreferrer"');
    expect(html).toContain('<a href="/resources/">our guide</a>');
  });

  it('wraps a table so it scrolls on a phone instead of widening the page', () => {
    const { html } = renderArticleHtml('| A | B |\n| - | - |\n| 1 | 2 |');
    expect(html).toContain('<div class="table-wrap" role="region" aria-label="Scrollable table" tabindex="0"><table>');
    expect(html).toContain('</table></div>');
  });

  it('keeps ordered and unordered lists, which the articles lean on', () => {
    const { html } = renderArticleHtml('1. One\n2. Two\n\n- Bullet');
    expect(html).toContain('<ol>');
    expect(html).toContain('<ul>');
  });
});

describe('renderBodyForEmail', () => {
  it('puts the styles on the elements, because mail clients drop stylesheets', () => {
    const html = renderBodyForEmail('## Heading\n\nA paragraph.');
    expect(html).toMatch(/<h2 style="[^"]+">Heading<\/h2>/);
    expect(html).toMatch(/<p style="[^"]+">A paragraph\.<\/p>/);
  });

  it('leaves no unstyled block tag behind', () => {
    const html = renderBodyForEmail('## H\n\nP\n\n- a\n\n1. b\n\n> quote');
    for (const tag of ['<h2>', '<p>', '<ul>', '<ol>', '<li>', '<blockquote>']) {
      expect(html).not.toContain(tag);
    }
  });

  it('strips a script here too', () => {
    expect(renderBodyForEmail('<script>alert(1)</script>Hello')).not.toContain('script');
  });
});

describe('markdownToPlainText', () => {
  it('keeps a link readable by putting the address beside the words', () => {
    expect(markdownToPlainText('See [the bulletin](https://example.com/b).')).toBe(
      'See the bulletin (https://example.com/b).',
    );
  });

  it('drops the heading marks and the emphasis marks', () => {
    expect(markdownToPlainText('## Title\n\n**bold** and *italic*')).toBe('Title\n\nbold and italic');
  });
});

describe('slugify', () => {
  it('makes a web address out of a headline', () => {
    expect(slugify('Reading the October 2026 EB-5 Visa Bulletin')).toBe('reading-the-october-2026-eb-5-visa-bulletin');
  });

  it('collapses punctuation rather than leaving a trailing hyphen', () => {
    expect(slugify('What now? — Costs, fees & dates!')).toBe('what-now-costs-fees-dates');
  });

  it('folds accents instead of dropping the word', () => {
    expect(slugify('Visa för Sverige')).toBe('visa-for-sverige');
  });
});

describe('table accessibility', () => {
  it('marks header cells with their scope, as the shipped tables do', () => {
    const { html } = renderArticleHtml('| Form | Fee |\n| - | - |\n| I-526E | $12,160 |');
    expect(html).toContain('<th scope="col">Form</th>');
    expect(html).toContain('<th scope="col">Fee</th>');
    // Body cells are not headers and must not be marked as any.
    expect(html).toContain('<td>I-526E</td>');
  });
});
