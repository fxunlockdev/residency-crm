import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { prisma } from '@/lib/prisma';
import { requireRole } from '@/lib/auth';
import { getClientFormOptions } from '@/lib/queries/form-options';
import { PageHeader } from '@/components/ui/page-header';
import { ClientForm } from '@/components/clients/client-form';
import { updateClientAction } from '@/server/client-actions';

export const metadata: Metadata = { title: 'Edit client' };

export default async function EditClientPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('ADVISOR');
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id } });
  if (!client) notFound();

  const options = await getClientFormOptions(id, {
    ownerId: client.ownerId,
    referredById: client.referredById,
    regionalCentreId: client.regionalCentreId,
    projectId: client.projectId,
  });
  const action = updateClientAction.bind(null, id);

  return (
    <>
      <PageHeader eyebrow={client.reference} title={`Edit ${client.fullName}`} />
      <ClientForm
        action={action}
        client={client}
        centres={options.centres}
        projects={options.projects}
        owners={options.owners}
        referrers={options.referrers}
        submitLabel="Save changes"
        cancelHref={`/clients/${id}`}
      />
    </>
  );
}
