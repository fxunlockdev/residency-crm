import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '@/lib/email';
import { renderLeadNotification } from '@/lib/lead-notification';

function mockFetch(status = 200) {
  const spy = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 'msg_1' }), { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

const body = (spy: ReturnType<typeof mockFetch>) => JSON.parse(spy.mock.calls[0][1].body as string);

beforeEach(() => {
  vi.stubEnv('RESEND_API_KEY', 'test-key');
  vi.stubEnv('ALERT_EMAIL_TO', 'ops@example.com');
  vi.stubEnv('ALERT_EMAIL_FROM', 'crm@residencyfirst.com');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sendEmail', () => {
  it('reports unconfigured mail as skipped, not as a failure', async () => {
    vi.stubEnv('RESEND_API_KEY', '');
    const spy = mockFetch();
    const result = await sendEmail({ subject: 'x', text: 'y' });
    // Callers only log real failures, so this must not look like one.
    expect(result.skipped).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('posts to Resend and treats 200 as sent', async () => {
    const spy = mockFetch(200);
    expect(await sendEmail({ subject: 'x', text: 'y' })).toEqual({ sent: true });
    expect(spy.mock.calls[0][0]).toBe('https://api.resend.com/emails');
  });

  it('sends recipients as plain strings, which is what Resend expects', async () => {
    const spy = mockFetch();
    await sendEmail({ subject: 'x', text: 'y', to: 'a@example.com, b@example.com' });
    expect(body(spy).to).toEqual(['a@example.com', 'b@example.com']);
  });

  it('names the sender so mail does not arrive from a bare address', async () => {
    const spy = mockFetch();
    await sendEmail({ subject: 'x', text: 'y' });
    expect(body(spy).from).toBe('Residency First <crm@residencyfirst.com>');
  });

  it('passes reply-to as a string and omits it when absent', async () => {
    const withReply = mockFetch();
    await sendEmail({ subject: 'x', text: 'y', replyTo: 'lead@example.com' });
    expect(body(withReply).reply_to).toBe('lead@example.com');

    vi.unstubAllGlobals();
    const without = mockFetch();
    await sendEmail({ subject: 'x', text: 'y' });
    expect(body(without)).not.toHaveProperty('reply_to');
  });

  it('drops a repeated address rather than mailing someone twice', async () => {
    const spy = mockFetch();
    await sendEmail({ subject: 'x', text: 'y', to: 'a@example.com, a@example.com, b@example.com' });
    expect(body(spy).to).toEqual(['a@example.com', 'b@example.com']);
  });

  it('stays within the fifty-recipient cap', async () => {
    const spy = mockFetch();
    const many = Array.from({ length: 60 }, (_, i) => `p${i}@example.com`).join(',');
    await sendEmail({ subject: 'x', text: 'y', to: many });
    expect(body(spy).to).toHaveLength(50);
  });

  it('never throws when the provider does', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('timed out')));
    expect(await sendEmail({ subject: 'x', text: 'y' })).toEqual({ sent: false, reason: 'timed out' });
  });
});

describe('lead notification body', () => {
  const lead = {
    fullName: 'Sample Person',
    email: 'sample@example.com',
    phone: '+971585536498',
    countryOfResidence: 'United Arab Emirates',
    preferredContactMethod: 'WHATSAPP',
    readiness: 'READY_NOW',
    enquiryIntent: null,
    source: 'WEBSITE',
    landingPage: '/eb-5/',
    message: 'We would like to discuss timing.',
    publicReference: 'RF-ABCDE-FGHJK',
    clientId: 'abc123',
    repeat: false,
  };

  it('spells out the codes a reader should not have to decode', () => {
    const text = renderLeadNotification(lead);
    expect(text).toContain('WhatsApp');
    expect(text).toContain('Ready now');
    expect(text).not.toContain('WITHIN_SIX_MONTHS');
    expect(text).not.toContain('READY_NOW');
  });

  it('leaves out rows with nothing in them', () => {
    const text = renderLeadNotification({ ...lead, phone: null, landingPage: null });
    expect(text).not.toContain('Phone');
    expect(text).not.toContain('Page');
    expect(text).toContain('Email');
  });

  it('says plainly when an enquiry is a repeat, and that nothing was overwritten', () => {
    const repeat = renderLeadNotification({ ...lead, repeat: true });
    expect(repeat).toContain('merged into their existing record');
    expect(repeat).toContain('nothing already on file was overwritten');
    expect(repeat).toContain('REPEAT ENQUIRY');

    const fresh = renderLeadNotification(lead);
    expect(fresh).toContain('NEW ENQUIRY');
    expect(fresh).not.toContain('merged');
  });

  it('links straight to the client in the CRM', () => {
    vi.stubEnv('APP_URL', 'https://crm.residencyfirst.com/');
    expect(renderLeadNotification(lead)).toContain('https://crm.residencyfirst.com/clients/abc123');
  });
});
