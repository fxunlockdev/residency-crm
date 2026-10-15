import type { Metadata } from 'next';
import { requireRole } from '@/lib/auth';
import { getClientFormOptions } from '@/lib/queries/form-options';
import { PageHeader } from '@/components/ui/page-header';
import { ClientForm } from '@/components/clients/client-form';
import { createClientAction } from '@/server/client-actions';

export const metadata: Metadata = { title: 'New client' };

export default async function NewClientPage() {
  await requireRole('ADVISOR');
  const options = await getClientFormOptions();

  return (
    <>
      <PageHeader
        eyebrow="Clients"
        title="Add a client"
        description="Only what Residency First needs. Never store passports, identity documents, source-of-funds evidence or bank details — the attorney holds those."
      />
      <ClientForm
        action={createClientAction}
        centres={options.centres}
        projects={options.projects}
        owners={options.owners}
        referrers={options.referrers}
        submitLabel="Create client"
        cancelHref="/clients"
      />
    </>
  );
}
