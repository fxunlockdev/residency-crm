import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { PageHeader } from '@/components/ui/page-header';
import { NewsletterForm } from '@/components/newsletter/newsletter-form';
import { createNewsletterAction } from '@/server/newsletter-actions';

export const metadata: Metadata = { title: 'Write a newsletter' };

export default async function NewNewsletterPage() {
  await requireRole('ADVISOR');

  return (
    <>
      <PageHeader
        eyebrow="Newsletter"
        title="Write a newsletter"
        description="Saved as a draft. Nothing is sent until you send a test, read it, and then send it to the list."
      />
      <NewsletterForm action={createNewsletterAction} submitLabel="Save draft" cancelHref="/newsletter" />
    </>
  );
}
