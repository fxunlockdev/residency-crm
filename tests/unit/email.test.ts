import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sendEmail } from '@/lib/email';
import { renderLeadNotification } from '@/lib/lead-notification';

function mockFetch(status = 202) {
  const spy = vi.fn().mockResolvedValue(new Response(null, { status }));
  vi.stubGlobal('fetch', spy);
  return spy;
}

const body = (spy: ReturnType<typeof mockFetch>) => JSON.parse(spy.mock.calls[0][1].body as string);

beforeEach(() => {
  vi.stubEnv('MAILERSEND_API_TOKEN', 'test-token');
  vi.stubEnv('ALERT_EMAIL_TO', 'ops@example.com');
  vi.stubEnv('ALERT_EMAIL_FROM', 'crm@residencyfirst.com');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe('sendEmail', () => {
  it('reports unconfigured mail as skipped, not as a failure', async () => {
    vi.stubEnv('MAILERSEND_API_TOKEN', '');
    const spy = mockFetch();
    const result = await sendEmail({ subject: 'x', text: 'y' });
    // Callers only log real failures, so this must not look like one.
    expect(result.skipped).toBe(true);
    expect(spy).not.toHaveBeenCalled();
  });

  it('treats 202 as sent, which is what MailerSend returns', async () => {
    mockFetch(202);
    expect(await sendEmail({ subject: 'x', text: 'y' })).toEqual({ sent: true });
  });

  it('builds the recipient objects MailerSend expects, not bare strings', async () => {
    const spy = mockFetch();
    await sendEmail({ subject: 'x', text: 'y', to: 'a@example.com, b@example.com' });
    expect(body(spy).to).toEqual([{ email: 'a@example.com' }, { email: 'b@example.com' }]);
  });

  it('wraps reply-to in an object and omits it when absent', async () => {
    const withReply = mockFetch();
    await sendEmail({ subject: 'x', text: 'y', replyTo: 'lead@example.com' });
    expect(body(withReply).reply_to).toEqual({ email: 'lead@example.com' });

    vi.unstubAllGlobals();
    const without = mockFetch();
    await sendEmail({ subject: 'x', text: 'y' });
    expect(body(without)).not.toHaveProperty('reply_to');
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

  it('says plainly when an enquiry is a repeat', () => {
    expect(renderLeadNotification({ ...lead, repeat: true })).toContain('merged into their existing record');
    expect(renderLeadNotification(lead)).toContain('A new enquiry');
  });

  it('links straight to the client in the CRM', () => {
    vi.stubEnv('APP_URL', 'https://crm.residencyfirst.com/');
    expect(renderLeadNotification(lead)).toContain('https://crm.residencyfirst.com/clients/abc123');
  });
});
