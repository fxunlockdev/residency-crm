import { describe, expect, it, vi, afterEach } from 'vitest';
import { renderEmailHtml, renderEmailText } from '@/lib/email-template';
import { leadEmail } from '@/lib/lead-notification';

const BASE = {
  eyebrow: 'New enquiry',
  heading: 'Sample Person',
  intro: 'Someone asked for a consultation.',
  rows: [{ label: 'Country', value: 'United Arab Emirates' }],
  reference: 'RF-ABCDE-FGHJK',
};

afterEach(() => vi.unstubAllEnvs());

describe('email template', () => {
  it('escapes everything a visitor can type', () => {
    const html = renderEmailHtml({
      ...BASE,
      heading: '<script>alert(1)</script>',
      quote: { label: 'In their words', text: '"><img src=x onerror=alert(1)>' },
      rows: [{ label: 'Country', value: "O'Brien & Sons <b>" }],
    });

    // The payload must appear only in escaped form.
    expect(html).not.toContain('<script>alert(1)</script>');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
    expect(html).toContain('O&#39;Brien &amp; Sons &lt;b&gt;');
  });

  it('refuses a link that is not http or https', () => {
    const html = renderEmailHtml({
      ...BASE,
      cta: { label: 'Open', href: 'javascript:alert(1)' },
    });
    expect(html).not.toContain('javascript:');
    expect(html).not.toContain('Open &rarr;');
  });

  it('keeps a real link', () => {
    const html = renderEmailHtml({
      ...BASE,
      cta: { label: 'Open in the CRM', href: 'https://crm.residencyfirst.com/clients/abc' },
    });
    expect(html).toContain('https://crm.residencyfirst.com/clients/abc');
  });

  it('carries the site palette rather than a generic template', () => {
    const html = renderEmailHtml(BASE);
    for (const colour of ['#102c38', '#9cddd6', '#16736e', '#f7f7f0']) {
      expect(html).toContain(colour);
    }
  });

  it('uses table layout and inline styles, which is what mail clients support', () => {
    const html = renderEmailHtml(BASE);
    expect(html).toContain('role="presentation"');
    // An external stylesheet or a <style> block is stripped by most clients.
    expect(html).not.toContain('<link');
    expect(html).not.toContain('<style');
  });

  it('omits sections that have no content, leaving no empty frames', () => {
    const html = renderEmailHtml({ eyebrow: 'Updates list', heading: 'A new subscriber' });
    expect(html).not.toContain('In their words');
    expect(html).not.toContain('quoted to the sender');
  });

  it('says the same thing in text for clients that will not render HTML', () => {
    const text = renderEmailText({ ...BASE, quote: { label: 'In their words', text: 'Hello' } });
    expect(text).toContain('NEW ENQUIRY');
    expect(text).toContain('Sample Person');
    expect(text).toContain('United Arab Emirates');
    expect(text).toContain('RF-ABCDE-FGHJK');
    expect(text).toContain('Hello');
    expect(text).not.toContain('<');
  });
});

describe('the enquiry alert itself', () => {
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

  it('drops empty rows instead of printing blank labels', () => {
    const email = leadEmail({ ...lead, phone: null, landingPage: null });
    const labels = (email.rows ?? []).map((r) => r.label);
    expect(labels).not.toContain('Phone');
    expect(labels).not.toContain('Page');
    expect(labels).toContain('Email');
  });

  it('spells out the codes rather than leaking enum names', () => {
    const html = renderEmailHtml(leadEmail(lead));
    expect(html).toContain('WhatsApp');
    expect(html).toContain('Ready now');
    expect(html).not.toContain('READY_NOW');
  });

  it('links to the client when APP_URL is set, and omits the button when it is not', () => {
    vi.stubEnv('APP_URL', 'https://crm.residencyfirst.com/');
    expect(leadEmail(lead).cta?.href).toBe('https://crm.residencyfirst.com/clients/abc123');

    vi.stubEnv('APP_URL', '');
    expect(leadEmail(lead).cta).toBeUndefined();
  });
});
