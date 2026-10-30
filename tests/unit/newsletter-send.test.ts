import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendNewsletter, unsubscribeUrl } from '@/lib/newsletter-send';
import { articleSchema, newsletterSchema, RESERVED_ARTICLE_SLUGS } from '@/lib/validation';

const letter = { subject: 'October update', preheader: null, bodyMarkdown: 'Hello **everyone**.' };

function people(count: number) {
  return Array.from({ length: count }, (_, i) => ({ email: `p${i}@example.com`, unsubscribeToken: `tok-${i}` }));
}

function mockFetch(status = 200) {
  const spy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [] }), { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

const batches = (spy: ReturnType<typeof mockFetch>) =>
  spy.mock.calls.map((call) => JSON.parse(call[1].body as string) as Array<Record<string, unknown>>);

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('ALERT_EMAIL_FROM', 'crm@residencyfirst.com');
  vi.stubEnv('PUBLIC_SITE_URL', 'https://www.residencyfirst.com');
  vi.useFakeTimers({ shouldAdvanceTime: true });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sendNewsletter', () => {
  it('addresses each subscriber on their own, never as one big to-line', async () => {
    const spy = mockFetch();
    await sendNewsletter(letter, people(3));

    const [batch] = batches(spy);
    expect(batch).toHaveLength(3);
    // The whole point: nobody can see who else is on the list.
    for (const message of batch!) expect(message.to).toHaveLength(1);
  });

  it('splits into calls of a hundred, which is the batch endpoint ceiling', async () => {
    const spy = mockFetch();
    const outcome = await sendNewsletter(letter, people(250));

    expect(batches(spy).map((batch) => batch.length)).toEqual([100, 100, 50]);
    expect(outcome).toEqual({ sent: 250, failed: 0 });
  });

  it('posts a bare array, not an object wrapping one', async () => {
    const spy = mockFetch();
    await sendNewsletter(letter, people(1));
    expect(Array.isArray(JSON.parse(spy.mock.calls[0][1].body as string))).toBe(true);
  });

  it('gives every recipient their own unsubscribe link, in the body and the headers', async () => {
    const spy = mockFetch();
    await sendNewsletter(letter, people(2));

    const [batch] = batches(spy);
    const first = batch![0] as { html: string; headers: Record<string, string> };
    const second = batch![1] as { html: string; headers: Record<string, string> };

    expect(first.html).toContain(unsubscribeUrl('tok-0'));
    expect(first.html).not.toContain(unsubscribeUrl('tok-1'));
    expect(second.headers['List-Unsubscribe']).toBe(`<${unsubscribeUrl('tok-1')}>`);
    expect(first.headers['List-Unsubscribe-Post']).toBe('List-Unsubscribe=One-Click');
  });

  it('always sends a text part, for clients that will not render HTML', async () => {
    const spy = mockFetch();
    await sendNewsletter(letter, people(1));
    const message = batches(spy)[0]![0] as { text: string };
    expect(message.text).toContain('Hello everyone.');
    expect(message.text).toContain('Unsubscribe:');
  });

  it('counts a failed batch as failed rather than silently reporting success', async () => {
    mockFetch(422);
    const outcome = await sendNewsletter(letter, people(150));
    expect(outcome.sent).toBe(0);
    expect(outcome.failed).toBe(150);
    expect(outcome.lastError).toContain('422');
  });

  it('reports progress after each batch, so an interrupted send is not a mystery', async () => {
    mockFetch();
    const seen: number[] = [];
    await sendNewsletter(letter, people(250), async (progress) => {
      seen.push(progress.sent);
    });
    expect(seen).toEqual([100, 200, 250]);
  });

  it('does not pretend to send when no key is configured', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const spy = mockFetch();
    const outcome = await sendNewsletter(letter, people(5));
    expect(outcome).toEqual({ sent: 0, failed: 5, lastError: 'RESEND_API_KEY is not set.' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('survives the provider throwing', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    const outcome = await sendNewsletter(letter, people(2));
    expect(outcome).toEqual({ sent: 0, failed: 2, lastError: 'socket hang up' });
  });
});

describe('unsubscribeUrl', () => {
  it('escapes the token rather than trusting it in a query string', () => {
    expect(unsubscribeUrl('a b&c')).toBe('https://www.residencyfirst.com/unsubscribe?token=a%20b%26c');
  });

  it('does not double the slash when the site URL has a trailing one', () => {
    vi.stubEnv('PUBLIC_SITE_URL', 'https://www.residencyfirst.com/');
    expect(unsubscribeUrl('t')).toBe('https://www.residencyfirst.com/unsubscribe?token=t');
  });
});

describe('article validation', () => {
  const valid = {
    slug: 'october-2026-policy-note',
    title: 'A headline long enough to pass',
    kind: 'News analysis',
    topic: 'Visa availability',
    standfirst: 'One sentence that summarises the article for the index page.',
    seoDescription: 'A search description of a realistic length, around one hundred and fifty characters, describing the article.',
    heroImage: 'new-york',
    bodyMarkdown: 'x'.repeat(250),
    sourceNote: '',
  };

  it('accepts a complete article', () => {
    expect(articleSchema.safeParse(valid).success).toBe(true);
  });

  it('refuses a slug that one of the shipped articles already serves', () => {
    for (const slug of RESERVED_ARTICLE_SLUGS) {
      const result = articleSchema.safeParse({ ...valid, slug });
      expect(result.success, slug).toBe(false);
    }
  });

  it('refuses a slug with spaces, slashes or capitals rather than quietly fixing it', () => {
    for (const slug of ['has spaces', 'has/slash', 'Trailing-', '-leading', 'double--hyphen']) {
      expect(articleSchema.safeParse({ ...valid, slug }).success, slug).toBe(false);
    }
  });

  it('refuses a hero image that is not one of the four the site ships', () => {
    expect(articleSchema.safeParse({ ...valid, heroImage: '/assets/anything.webp' }).success).toBe(false);
  });

  it('refuses a category the published filter buttons do not offer', () => {
    expect(articleSchema.safeParse({ ...valid, kind: 'Opinion' }).success).toBe(false);
  });

  it('lowercases a slug typed in capitals', () => {
    const parsed = articleSchema.safeParse({ ...valid, slug: 'October-Note' });
    expect(parsed.success && parsed.data.slug).toBe('october-note');
  });
});

describe('newsletter validation', () => {
  it('needs a subject and something to say', () => {
    expect(newsletterSchema.safeParse({ subject: 'Hi', bodyMarkdown: 'short' }).success).toBe(false);
    expect(
      newsletterSchema.safeParse({ subject: 'October EB-5 update', bodyMarkdown: 'x'.repeat(60) }).success,
    ).toBe(true);
  });
});
