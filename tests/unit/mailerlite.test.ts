import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { syncSubscriber } from '@/lib/mailerlite';

const BASE = {
  email: 'investor@example.com',
  phone: '+971585536498',
  name: 'Sample Person',
  consentEmail: true,
  consentWhatsapp: false,
  consentAt: new Date('2026-10-30T09:15:30.123Z'),
};

function mockFetch(status = 201, body = '{}') {
  const spy = vi.fn().mockResolvedValue(new Response(body, { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

function sentBody(spy: ReturnType<typeof mockFetch>) {
  return JSON.parse(spy.mock.calls[0][1].body as string);
}

beforeEach(() => {
  vi.stubEnv('MAILERLITE_API_KEY', 'test-key');
  vi.stubEnv('MAILERLITE_GROUP_EMAIL', '111');
  vi.stubEnv('MAILERLITE_GROUP_WHATSAPP', '222');
  vi.stubEnv('MAILERLITE_PHONE_FIELD', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('MailerLite subscriber sync', () => {
  it('does nothing at all when no key is configured', async () => {
    vi.stubEnv('MAILERLITE_API_KEY', '');
    const spy = mockFetch();
    const result = await syncSubscriber(BASE);
    expect(result).toEqual({ synced: false, skipped: true, reason: 'MAILERLITE_API_KEY is not set.' });
    expect(spy).not.toHaveBeenCalled();
  });

  it('skips a WhatsApp-only subscriber rather than failing', async () => {
    const spy = mockFetch();
    const result = await syncSubscriber({ ...BASE, email: null, consentEmail: false, consentWhatsapp: true });
    // MailerLite is keyed on email. Our own table still holds their consent,
    // so there is nothing wrong here and nothing to alert on.
    expect(result.skipped).toBe(true);
    expect(result.synced).toBe(false);
    expect(spy).not.toHaveBeenCalled();
  });

  it('sends only the groups for the channels actually ticked', async () => {
    const spy = mockFetch();
    await syncSubscriber(BASE);
    expect(sentBody(spy).groups).toEqual(['111']);

    vi.unstubAllGlobals();
    const both = mockFetch();
    await syncSubscriber({ ...BASE, consentWhatsapp: true });
    expect(sentBody(both).groups).toEqual(['111', '222']);
  });

  it('omits groups entirely when none are configured', async () => {
    vi.stubEnv('MAILERLITE_GROUP_EMAIL', '');
    vi.stubEnv('MAILERLITE_GROUP_WHATSAPP', '');
    const spy = mockFetch();
    await syncSubscriber(BASE);
    // An empty array would be rejected; the subscriber should still be created.
    expect(sentBody(spy)).not.toHaveProperty('groups');
  });

  it('formats the opt-in time the way MailerLite expects, not as ISO 8601', async () => {
    const spy = mockFetch();
    await syncSubscriber(BASE);
    expect(sentBody(spy).opted_in_at).toBe('2026-10-30 09:15:30');
  });

  it('leaves the phone out unless a field key is named', async () => {
    const spy = mockFetch();
    await syncSubscriber(BASE);
    // An unknown fields key makes MailerLite reject the whole subscriber.
    expect(sentBody(spy).fields).toEqual({ name: 'Sample Person' });

    vi.unstubAllGlobals();
    vi.stubEnv('MAILERLITE_PHONE_FIELD', 'phone');
    const withPhone = mockFetch();
    await syncSubscriber(BASE);
    expect(sentBody(withPhone).fields).toEqual({ name: 'Sample Person', phone: '+971585536498' });
  });

  it('treats 200 as success, since that is what an existing subscriber returns', async () => {
    mockFetch(200);
    expect(await syncSubscriber(BASE)).toEqual({ synced: true });
  });

  it('reports a rejection with enough detail to debug it', async () => {
    mockFetch(422, '{"message":"Unknown field key"}');
    const result = await syncSubscriber(BASE);
    expect(result.synced).toBe(false);
    expect(result.skipped).toBeUndefined();
    expect(result.reason).toContain('422');
    expect(result.reason).toContain('Unknown field key');
  });

  it('never throws when the network does', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('socket hang up')));
    const result = await syncSubscriber(BASE);
    expect(result).toEqual({ synced: false, reason: 'socket hang up' });
  });
});
