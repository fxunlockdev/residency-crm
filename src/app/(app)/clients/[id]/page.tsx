import Link from 'next/link';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { getClientDetail } from '@/lib/queries/clients';
import { getCurrentUser, hasRole } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { PageHeader } from '@/components/ui/page-header';
import { CommissionChip, CountryChip, SourceChip, StatusChip } from '@/components/ui/chips';
import { DefinitionList } from '@/components/ui/definition-list';
import { MilestoneTrack } from '@/components/clients/milestone-track';
import { StatusControl } from '@/components/clients/status-control';
import { MeetingComposer } from '@/components/clients/meeting-composer';
import { CommissionPanel } from '@/components/clients/commission-editor';
import { DocumentUploader } from '@/components/clients/document-uploader';
import { EmptyState } from '@/components/ui/empty-state';
import { SubmitButton } from '@/components/ui/submit-button';
import { formatCents } from '@/lib/money';
import { daysUntil, formatDate, formatDateTime, relativeDays, todayUtc } from '@/lib/dates';
import { COMMISSION_TRIGGER_LABEL, DOCUMENT_KIND_LABEL, isRetrogressionCountry, MEETING_TYPE_LABEL } from '@/lib/labels';
import { formatBytes } from '@/lib/storage';
import { deleteClientAction } from '@/server/client-actions';
import { deleteMeetingAction } from '@/server/meeting-actions';
import { deleteDocumentAction } from '@/server/document-actions';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const client = await prisma.client.findUnique({ where: { id }, select: { fullName: true } });
  return { title: client?.fullName ?? 'Client' };
}

export default async function ClientDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [client, user] = await Promise.all([getClientDetail(id), getCurrentUser()]);
  if (!client) notFound();

  const canEdit = !!user && hasRole(user, 'ADVISOR');
  const canDelete = !!user && hasRole(user, 'ADMIN');
  const today = todayUtc();

  const activity = await prisma.auditLog.findMany({
    where: { entity: 'Client', entityId: id },
    orderBy: { createdAt: 'desc' },
    take: 25,
  });

  const commissionTotal = client.commissions.reduce((sum, c) => sum + c.amountCents, 0);
  const commissionPaid = client.commissions
    .filter((c) => c.status === 'PAID')
    .reduce((sum, c) => sum + (c.amountReceivedCents ?? c.amountCents), 0);
  const outstanding = commissionTotal - commissionPaid;

  const milestones = [
    {
      label: client.importBatch ? 'Record migrated' : 'Record created',
      date: client.createdAt,
      reached: true,
    },
    { label: 'Funded', date: client.dateFunded, reached: !!client.dateFunded },
    { label: 'I-526E filed', date: client.i526eFiledDate, reached: !!client.i526eFiledDate },
    { label: 'I-526E approved', date: client.i526eApprovedDate, reached: !!client.i526eApprovedDate },
    {
      label: 'Green card issued (conditional)',
      date: client.greenCardIssuedDate,
      reached: !!client.greenCardIssuedDate,
    },
    { label: 'I-829 filed', date: client.i829FiledDate, reached: !!client.i829FiledDate },
    { label: 'I-829 approved (permanent)', date: client.i829ApprovedDate, reached: !!client.i829ApprovedDate },
  ];

  return (
    <>
      <PageHeader
        eyebrow={client.reference}
        title={client.fullName}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusChip status={client.status} />
            <SourceChip source={client.source} />
            {client.marketingConsent ? (
              <span className="chip border-stage-emerald/25 bg-stage-emerald/10 text-stage-emerald">
                Marketing consent
              </span>
            ) : (
              <span className="chip border-line bg-cream-deep text-ink-mute">No marketing consent</span>
            )}
          </span>
        }
        actions={
          canEdit ? (
            <>
              <Link href={`/clients/${client.id}/edit`} className="btn-ghost">
                Edit
              </Link>
            </>
          ) : null
        }
      />

      {canEdit ? (
        <div className="mb-8 rounded-xl2 border border-line bg-cream-deep/40 px-5 py-4">
          <p className="eyebrow mb-3">Move through the pipeline</p>
          <StatusControl clientId={client.id} status={client.status} />
          <p className="mt-3 text-xs text-ink-mute">
            Moving a stage fills its date if empty, releases any matching commission and records the change in the
            activity log.
          </p>
        </div>
      ) : null}

      <div className="grid gap-10 lg:grid-cols-[1.35fr_1fr] lg:gap-8">
        <div className="space-y-10">
          {/* Contact and case */}
          <section>
            <h2 className="h-section mb-5">Case details</h2>
            <DefinitionList
              items={[
                {
                  label: 'Email',
                  value: client.email ? (
                    <a className="link" href={`mailto:${client.email}`}>
                      {client.email}
                    </a>
                  ) : null,
                },
                { label: 'Secondary email', value: client.secondaryEmail },
                {
                  label: 'Phone / WhatsApp',
                  value: client.phone ? (
                    <a className="link" href={`tel:${client.phone.replace(/\s/g, '')}`}>
                      {client.phone}
                    </a>
                  ) : null,
                },
                { label: 'Country of residence', value: client.countryOfResidence },
                {
                  label: 'Country of birth',
                  value: client.countryOfBirth ? (
                    <CountryChip
                      country={client.countryOfBirth}
                      flagged={isRetrogressionCountry(client.countryOfBirth)}
                    />
                  ) : null,
                },
                { label: 'Immigration attorney', value: client.attorney },
                { label: 'Case worker', value: client.caseWorker },
                { label: 'Regional centre', value: client.regionalCentre?.name },
                { label: 'Project', value: client.project?.name },
                { label: 'Investment amount', value: formatCents(client.investmentAmountCents) },
                { label: 'I-526E receipt number', value: client.i526eReceiptNumber },
                { label: 'Owner', value: client.owner?.name },
                {
                  label: 'Referred by',
                  value: client.referredBy ? (
                    <Link className="link" href={`/clients/${client.referredBy.id}`}>
                      {client.referredBy.fullName}
                    </Link>
                  ) : (
                    client.referredByName
                  ),
                },
                {
                  label: 'Referrals made',
                  value:
                    client.referrals.length > 0 ? (
                      <span className="flex flex-wrap gap-2">
                        {client.referrals.map((referral) => (
                          <Link key={referral.id} href={`/clients/${referral.id}`} className="link">
                            {referral.fullName}
                          </Link>
                        ))}
                      </span>
                    ) : null,
                },
                {
                  label: 'Next action',
                  value: client.nextAction,
                  wide: true,
                },
                {
                  label: 'Follow-up date',
                  value: client.followUpDate ? (
                    <span className={(daysUntil(client.followUpDate) ?? 1) <= 0 ? 'font-medium text-pink-deep' : ''}>
                      {formatDate(client.followUpDate)} · {relativeDays(client.followUpDate)}
                    </span>
                  ) : null,
                },
              ]}
            />

            {client.notes ? (
              <div className="mt-6 border-t border-line pt-5">
                <p className="eyebrow mb-2">Notes</p>
                <p className="max-w-[68ch] whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                  {client.notes}
                </p>
              </div>
            ) : null}
          </section>

          {/* Commissions */}
          <section className="surface p-6">
            <div className="mb-5 flex flex-wrap items-baseline justify-between gap-3">
              <h2 className="h-section">Commissions</h2>
              <p className="text-sm text-ink-mute tabular">
                {formatCents(commissionTotal)} total · {formatCents(commissionPaid)} received
                {outstanding > 0 ? ` · ${formatCents(outstanding)} outstanding` : ''}
              </p>
            </div>

            {client.commissions.length === 0 ? (
              <EmptyState
                title="No commissions recorded"
                description="Add the fee agreed with the regional centre so it can be tracked through to payment."
              />
            ) : (
              <ul className="divide-y divide-line">
                {client.commissions.map((commission) => {
                  const overdue =
                    commission.status === 'INVOICED' &&
                    !!commission.paymentDueDate &&
                    commission.paymentDueDate < today;
                  const shortPaid =
                    commission.amountReceivedCents !== null &&
                    commission.amountReceivedCents < commission.amountCents;

                  return (
                    <li key={commission.id} className="py-4 first:pt-0 last:pb-0">
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div>
                          <p className="font-serif text-base font-medium tabular">{formatCents(commission.amountCents)}</p>
                          <p className="mt-1 text-xs text-ink-mute">
                            {COMMISSION_TRIGGER_LABEL[commission.trigger]}
                            {commission.invoiceNumber ? ` · Invoice ${commission.invoiceNumber}` : ''}
                          </p>
                          <p className="mt-2 flex flex-wrap items-center gap-2">
                            <CommissionChip status={commission.status} overdue={overdue} />
                            {shortPaid ? (
                              <span className="chip border-stage-rose/30 bg-stage-rose/10 text-stage-rose">
                                Short paid by {formatCents(commission.amountCents - (commission.amountReceivedCents ?? 0))}
                              </span>
                            ) : null}
                            {commission.paidDateUnknown ? (
                              <span className="chip border-line bg-cream-deep text-ink-mute">Paid, date unknown</span>
                            ) : null}
                          </p>
                        </div>
                        {canEdit ? <CommissionPanel clientId={client.id} commission={commission} /> : null}
                      </div>

                      <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-1 text-xs text-ink-mute sm:grid-cols-4">
                        <Detail label="Invoice sent" value={formatDate(commission.invoiceSentDate)} />
                        <Detail label="Payment due" value={formatDate(commission.paymentDueDate)} />
                        <Detail label="Received" value={formatDate(commission.paymentReceivedDate)} />
                        <Detail label="Amount received" value={formatCents(commission.amountReceivedCents)} />
                      </dl>

                      {commission.notes ? (
                        <p className="mt-2 text-xs italic text-ink-mute">{commission.notes}</p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            )}

            {canEdit ? (
              <div className="mt-5">
                <CommissionPanel clientId={client.id} />
              </div>
            ) : null}
          </section>

          {/* Meetings */}
          <section className="surface p-6">
            <div className="mb-5 flex items-baseline justify-between">
              <h2 className="h-section">Meetings</h2>
              <p className="text-sm text-ink-mute tabular">{client.meetings.length} logged</p>
            </div>

            {canEdit ? (
              <div className="mb-5">
                <MeetingComposer clientId={client.id} />
              </div>
            ) : null}

            {client.meetings.length === 0 ? (
              <EmptyState title="No meetings yet" description="Calls, Zooms, WhatsApp threads and in-person meetings land here, newest first." />
            ) : (
              <ul className="divide-y divide-line">
                {client.meetings.map((meeting) => (
                  <li key={meeting.id} className="py-4 first:pt-0 last:pb-0">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="flex flex-wrap items-center gap-2 text-sm">
                          <span className="chip border-line bg-cream-deep text-ink-soft">
                            {MEETING_TYPE_LABEL[meeting.type]}
                          </span>
                          <span className="font-medium tabular">{formatDateTime(meeting.occurredAt)}</span>
                        </p>
                        {meeting.attendees ? (
                          <p className="mt-1.5 text-xs text-ink-mute">With {meeting.attendees}</p>
                        ) : null}
                        {meeting.summary ? (
                          <p className="mt-2 max-w-[68ch] whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">
                            {meeting.summary}
                          </p>
                        ) : null}
                        <p className="mt-2 text-xs text-ink-mute">
                          Logged by {meeting.createdBy?.name ?? 'Import'}
                        </p>
                      </div>
                      {canEdit ? (
                        <form action={deleteMeetingAction}>
                          <input type="hidden" name="meetingId" value={meeting.id} />
                          <SubmitButton
                            className="btn-quiet-danger"
                            pendingLabel="Removing…"
                            confirm={`Remove this meeting from ${client.fullName}? This cannot be undone.`}
                          >
                            Remove
                          </SubmitButton>
                        </form>
                      ) : null}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        {/* Right rail */}
        <div className="space-y-10">
          <section>
            <h2 className="h-section mb-5">Case timeline</h2>
            <MilestoneTrack milestones={milestones} />
          </section>

          <section className="surface p-6">
            <h2 className="h-section mb-4">Documents</h2>
            {canEdit ? (
              <div className="mb-5">
                <DocumentUploader clientId={client.id} />
              </div>
            ) : null}

            {client.documents.length === 0 ? (
              <p className="text-sm text-ink-mute">No files attached.</p>
            ) : (
              <ul className="divide-y divide-line">
                {client.documents.map((document) => (
                  <li key={document.id} className="flex items-center justify-between gap-3 py-3 first:pt-0 last:pb-0">
                    <span className="min-w-0">
                      <a className="link block truncate" href={`/api/documents/${document.id}`} target="_blank" rel="noreferrer">
                        {document.filename}
                      </a>
                      <span className="mt-0.5 block text-xs text-ink-mute">
                        {DOCUMENT_KIND_LABEL[document.kind]} · {formatBytes(document.sizeBytes)} ·{' '}
                        {formatDate(document.createdAt)}
                      </span>
                    </span>
                    {canEdit ? (
                      <form action={deleteDocumentAction} className="shrink-0">
                        <input type="hidden" name="documentId" value={document.id} />
                        <SubmitButton
                          className="btn-quiet-danger"
                          pendingLabel="Deleting…"
                          confirm={`Delete ${document.filename}? This cannot be undone.`}
                        >
                          Delete
                        </SubmitButton>
                      </form>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <LegacyPanel client={client} />

          <section className="border-t border-line pt-8">
            <h2 className="h-section mb-4">Activity</h2>
            {activity.length === 0 ? (
              <p className="text-sm text-ink-mute">Nothing recorded yet.</p>
            ) : (
              <ol className="space-y-3 text-sm">
                {activity.map((entry) => (
                  <li key={entry.id} className="flex gap-3">
                    <span aria-hidden className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-pink" />
                    <span>
                      <span className="block text-ink-soft">{entry.summary ?? `${entry.action}`}</span>
                      <span className="block text-xs text-ink-mute">{formatDateTime(entry.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ol>
            )}
          </section>

          {canDelete ? (
            <section className="rounded-xl2 border border-stage-rose/25 bg-stage-rose/5 p-6">
              <h2 className="h-section text-stage-rose">Delete this client</h2>
              <p className="mt-1.5 text-sm text-ink-mute">
                Removes the record and everything attached to it. Use “Lost / Not proceeding” instead to keep the
                history.
              </p>
              <form action={deleteClientAction} className="mt-4">
                <input type="hidden" name="clientId" value={client.id} />
                <SubmitButton
                  className="btn-danger"
                  pendingLabel="Deleting…"
                  confirm={`Permanently delete ${client.fullName} (${client.reference}), along with every meeting, commission and document attached? This cannot be undone.`}
                >
                  Delete permanently
                </SubmitButton>
              </form>
            </section>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[0.6875rem] uppercase tracking-[0.07em]">{label}</dt>
      <dd className="text-ink-soft tabular">{value}</dd>
    </div>
  );
}

function LegacyPanel({ client }: { client: { legacyInvestorStatus: string | null; spouseOrParent: string | null; adminFeeCents: number | null; pmFeeCents: number | null; interestReceived: boolean | null; interestRatePct: number | null; interestToGalerie: boolean | null; sourceRaw: string | null; legacyBusiness: string | null; legacyProgramme: string | null; importBatch: string | null } }) {
  if (!client.importBatch) return null;

  return (
    <details className="group border-t border-line pt-8">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-3">
        <span>
          <span className="h-section">Legacy record</span>
          <span className="mt-1 block text-xs text-ink-mute">
            Carried over from the Zoho export so nothing was lost in the move. Read-only history.
          </span>
        </span>
        <span aria-hidden className="shrink-0 text-ink-mute transition-transform duration-200 group-open:rotate-180">
          ⌄
        </span>
      </summary>
      <div className="mt-5" />
      <DefinitionList
        items={[
          { label: 'Original status', value: client.legacyInvestorStatus },
          { label: 'Original source', value: client.sourceRaw },
          { label: 'Spouse / parent', value: client.spouseOrParent },
          { label: 'Admin fee paid', value: client.adminFeeCents ? formatCents(client.adminFeeCents) : null },
          { label: 'Fee paid to PM', value: client.pmFeeCents ? formatCents(client.pmFeeCents) : null },
          {
            label: 'Interest received',
            value:
              client.interestReceived === null
                ? null
                : client.interestReceived
                  ? `Yes${client.interestRatePct ? ` · ${client.interestRatePct}% p.a.` : ''}`
                  : 'No',
          },
          {
            label: 'Interest to Galerie',
            value: client.interestToGalerie === null ? null : client.interestToGalerie ? 'Yes' : 'No',
          },
          { label: 'Business', value: client.legacyBusiness },
          { label: 'Programme', value: client.legacyProgramme },
        ]}
      />
    </details>
  );
}
