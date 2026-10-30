import { renderEmailHtml } from './src/lib/email-template';
import { leadEmail } from './src/lib/lead-notification';
import { writeFileSync } from 'node:fs';

process.env.APP_URL = 'https://crm.residencyfirst.com';

const enquiry = renderEmailHtml(
  leadEmail({
    fullName: 'Anita Raghunathan',
    email: 'a.raghunathan@example.com',
    phone: '+971 58 553 6498',
    countryOfResidence: 'United Arab Emirates',
    preferredContactMethod: 'WHATSAPP',
    readiness: 'WITHIN_SIX_MONTHS',
    enquiryIntent: 'personalised-cost-breakdown',
    source: 'GOOGLE_ADS',
    landingPage: 'https://www.residencyfirst.com/eb5-green-card/',
    message:
      'We are a family of four currently in Dubai. We would like to understand the total cost including the filing fees before the November change, and whether our eldest is at risk of ageing out.',
    publicReference: 'RF-4H9KD-E5XR6',
    clientId: 'clx123',
    repeat: false,
  }),
);

const subscriber = renderEmailHtml({
  eyebrow: 'Updates list',
  heading: 'A new subscriber',
  intro:
    'Someone joined the EB-5 deadline updates list. This is a news signup, not a consultation enquiry, and no client record was created.',
  rows: [
    { label: 'Name', value: 'Daniel Okafor' },
    { label: 'Contact', value: 'd.okafor@example.com' },
    { label: 'Channels', value: 'Email and WhatsApp' },
    { label: 'Page', value: '/insights/source-of-funds/' },
  ],
});

const dir = process.argv[2];
writeFileSync(`${dir}/email-enquiry.html`, enquiry);
writeFileSync(`${dir}/email-subscriber.html`, subscriber);
console.log('written');
