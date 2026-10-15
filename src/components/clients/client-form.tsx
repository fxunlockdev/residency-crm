'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import type { Client, LeadSource, ClientStatus } from '@prisma/client';
import { Field, FormSection } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { STATUS_DATE_FIELD, STATUS_LABEL, STATUS_ORDER } from '@/lib/pipeline';
import { SOURCE_LABEL } from '@/lib/labels';
import { toDateInputValue } from '@/lib/dates';
import type { FormState } from '@/server/client-actions';

type Option = { value: string; label: string };

export function ClientForm({
  action,
  client,
  centres,
  projects,
  owners,
  referrers,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  client?: Client | null;
  centres: Option[];
  projects: Option[];
  owners: Option[];
  referrers: Option[];
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [status, setStatus] = useState<ClientStatus>(client?.status ?? 'PROSPECT');
  const [source, setSource] = useState<LeadSource>(client?.source ?? 'OTHER');
  const errors = state.errors ?? {};

  const autoDateField = STATUS_DATE_FIELD[status];

  return (
    <form action={formAction} className="pb-24" noValidate>
      {state.message ? (
        <div className="mb-6">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      ) : null}

      <FormSection title="Applicant" description="One record per applicant, prospect or client.">
        <Field label="Full name" name="fullName" error={errors.fullName} required className="sm:col-span-2">
          <input
            id="fullName"
            name="fullName"
            defaultValue={client?.fullName ?? ''}
            className="field"
            required
            maxLength={160}
            autoComplete="off"
          />
        </Field>

        <Field label="Email" name="email" error={errors.email}>
          <input id="email" name="email" type="email" defaultValue={client?.email ?? ''} className="field" />
        </Field>

        <Field label="Secondary email" name="secondaryEmail" error={errors.secondaryEmail}>
          <input
            id="secondaryEmail"
            name="secondaryEmail"
            type="email"
            defaultValue={client?.secondaryEmail ?? ''}
            className="field"
          />
        </Field>

        <Field label="Phone / WhatsApp" name="phone" error={errors.phone}>
          <input id="phone" name="phone" defaultValue={client?.phone ?? ''} className="field" inputMode="tel" />
        </Field>

        <Field label="Country of residence" name="countryOfResidence" error={errors.countryOfResidence}>
          <input
            id="countryOfResidence"
            name="countryOfResidence"
            defaultValue={client?.countryOfResidence ?? ''}
            className="field"
          />
        </Field>

        <Field
          label="Country of birth"
          name="countryOfBirth"
          error={errors.countryOfBirth}
          hint="Determines visa chargeability — India and China face longer Visa Bulletin waits."
        >
          <input
            id="countryOfBirth"
            name="countryOfBirth"
            defaultValue={client?.countryOfBirth ?? ''}
            className="field"
          />
        </Field>
      </FormSection>

      <FormSection title="Attribution" description="Where the enquiry came from, and who to credit.">
        <Field label="Source" name="source" error={errors.source} required>
          <select
            id="source"
            name="source"
            className="field"
            value={source}
            onChange={(event) => setSource(event.target.value as LeadSource)}
          >
            {(Object.keys(SOURCE_LABEL) as LeadSource[]).map((value) => (
              <option key={value} value={value}>
                {SOURCE_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Referred by (existing client)"
          name="referredById"
          error={errors.referredById}
          hint={source !== 'REFERRAL' ? 'Usually only set when the source is Referral.' : undefined}
        >
          <select id="referredById" name="referredById" className="field" defaultValue={client?.referredById ?? ''}>
            <option value="">Not a client referral</option>
            {referrers.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Referrer name"
          name="referredByName"
          error={errors.referredByName}
          hint="Use when the referrer is not a client record — an attorney, partner or past contact."
        >
          <input
            id="referredByName"
            name="referredByName"
            defaultValue={client?.referredByName ?? ''}
            className="field"
          />
        </Field>

        <Field label="Owner" name="ownerId" error={errors.ownerId}>
          <select id="ownerId" name="ownerId" className="field" defaultValue={client?.ownerId ?? ''}>
            <option value="">Unassigned</option>
            {owners.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <div className="sm:col-span-2">
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-line bg-cream-deep/40 px-4 py-3">
            <input
              type="checkbox"
              name="marketingConsent"
              defaultChecked={client?.marketingConsent ?? false}
              className="mt-0.5 h-4 w-4 rounded border-line-strong text-pink-deep focus:ring-pink/40"
            />
            <span className="text-sm">
              <span className="block font-medium text-ink">Marketing consent given</span>
              <span className="mt-0.5 block text-ink-mute">
                Required before this client can be included in any email marketing.
              </span>
            </span>
          </label>
        </div>
      </FormSection>

      <FormSection title="Case" description="Stage, advisers and the investment itself.">
        <Field
          label="Status"
          name="status"
          error={errors.status}
          required
          hint={
            autoDateField
              ? 'Saving at this stage fills the matching date with today if it is still empty.'
              : undefined
          }
        >
          <select
            id="status"
            name="status"
            className="field"
            value={status}
            onChange={(event) => setStatus(event.target.value as ClientStatus)}
          >
            {STATUS_ORDER.map((value) => (
              <option key={value} value={value}>
                {STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Investment amount (USD)"
          name="investmentAmount"
          error={errors.investmentAmount}
          hint="$800,000 today; about $937,500 for TEA from 1 Jan 2027."
        >
          <input
            id="investmentAmount"
            name="investmentAmount"
            defaultValue={client?.investmentAmountCents ? String(client.investmentAmountCents / 100) : ''}
            className="field"
            inputMode="decimal"
            placeholder="800000"
          />
        </Field>

        <Field label="Immigration attorney" name="attorney" error={errors.attorney}>
          <input id="attorney" name="attorney" defaultValue={client?.attorney ?? ''} className="field" />
        </Field>

        <Field label="Case worker" name="caseWorker" error={errors.caseWorker}>
          <input id="caseWorker" name="caseWorker" defaultValue={client?.caseWorker ?? ''} className="field" />
        </Field>

        <Field label="Regional centre" name="regionalCentreId" error={errors.regionalCentreId}>
          <select
            id="regionalCentreId"
            name="regionalCentreId"
            className="field"
            defaultValue={client?.regionalCentreId ?? ''}
          >
            <option value="">Not set</option>
            {centres.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Project" name="projectId" error={errors.projectId}>
          <select id="projectId" name="projectId" className="field" defaultValue={client?.projectId ?? ''}>
            <option value="">Not set</option>
            {projects.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
      </FormSection>

      <FormSection title="Milestones" description="Leave a date empty and the matching status change will fill it in.">
        <Field label="Date funded" name="dateFunded" error={errors.dateFunded}>
          <input
            id="dateFunded"
            name="dateFunded"
            type="date"
            defaultValue={toDateInputValue(client?.dateFunded)}
            className="field"
          />
        </Field>

        <Field label="I-526E filed" name="i526eFiledDate" error={errors.i526eFiledDate}>
          <input
            id="i526eFiledDate"
            name="i526eFiledDate"
            type="date"
            defaultValue={toDateInputValue(client?.i526eFiledDate)}
            className="field"
          />
        </Field>

        <Field label="I-526E receipt number" name="i526eReceiptNumber" error={errors.i526eReceiptNumber}>
          <input
            id="i526eReceiptNumber"
            name="i526eReceiptNumber"
            defaultValue={client?.i526eReceiptNumber ?? ''}
            className="field"
          />
        </Field>

        <Field label="I-526E approved" name="i526eApprovedDate" error={errors.i526eApprovedDate}>
          <input
            id="i526eApprovedDate"
            name="i526eApprovedDate"
            type="date"
            defaultValue={toDateInputValue(client?.i526eApprovedDate)}
            className="field"
          />
        </Field>

        <Field label="Green card issued (conditional)" name="greenCardIssuedDate" error={errors.greenCardIssuedDate}>
          <input
            id="greenCardIssuedDate"
            name="greenCardIssuedDate"
            type="date"
            defaultValue={toDateInputValue(client?.greenCardIssuedDate)}
            className="field"
          />
        </Field>

        <Field label="I-829 filed" name="i829FiledDate" error={errors.i829FiledDate}>
          <input
            id="i829FiledDate"
            name="i829FiledDate"
            type="date"
            defaultValue={toDateInputValue(client?.i829FiledDate)}
            className="field"
          />
        </Field>

        <Field label="I-829 approved" name="i829ApprovedDate" error={errors.i829ApprovedDate}>
          <input
            id="i829ApprovedDate"
            name="i829ApprovedDate"
            type="date"
            defaultValue={toDateInputValue(client?.i829ApprovedDate)}
            className="field"
          />
        </Field>
      </FormSection>

      <FormSection title="Working notes" description="What happens next, and anything worth remembering.">
        <Field label="Next action" name="nextAction" error={errors.nextAction} className="sm:col-span-2">
          <input
            id="nextAction"
            name="nextAction"
            defaultValue={client?.nextAction ?? ''}
            className="field"
            placeholder="Send project deck"
            maxLength={240}
          />
        </Field>

        <Field label="Follow-up date" name="followUpDate" error={errors.followUpDate}>
          <input
            id="followUpDate"
            name="followUpDate"
            type="date"
            defaultValue={toDateInputValue(client?.followUpDate)}
            className="field"
          />
        </Field>

        <Field label="Notes" name="notes" error={errors.notes} className="sm:col-span-2">
          <textarea id="notes" name="notes" defaultValue={client?.notes ?? ''} className="field" rows={6} />
        </Field>
      </FormSection>

      <div className="sticky bottom-0 -mx-4 mt-2 flex items-center justify-end gap-3 border-t border-line bg-cream/90 px-4 py-4 backdrop-blur sm:-mx-8 sm:px-8">
        <Link href={cancelHref} className="btn-ghost">
          Cancel
        </Link>
        <SubmitButton className="btn-accent">{submitLabel}</SubmitButton>
      </div>
    </form>
  );
}
