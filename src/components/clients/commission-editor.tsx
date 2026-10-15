'use client';

import { useActionState, useEffect, useState } from 'react';
import type { Commission } from '@prisma/client';
import { createCommissionAction, updateCommissionAction } from '@/server/commission-actions';
import { Field } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { COMMISSION_STATUS_LABEL, COMMISSION_TRIGGER_LABEL } from '@/lib/labels';
import { toDateInputValue } from '@/lib/dates';
import type { FormState } from '@/server/client-actions';
import type { CommissionStatus, CommissionTrigger } from '@prisma/client';

export function CommissionEditor({
  clientId,
  commission,
  onDone,
}: {
  clientId: string;
  commission?: Commission;
  onDone?: () => void;
}) {
  const action = commission ? updateCommissionAction.bind(null, commission.id) : createCommissionAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});

  useEffect(() => {
    if (state.ok) onDone?.();
  }, [state.ok, onDone]);

  return (
    <form action={formAction} className="rounded-xl2 border border-line bg-cream-deep/40 p-5">
      <input type="hidden" name="clientId" value={clientId} />
      {state.message && !state.ok ? (
        <div className="mb-4">
          <Alert tone="error">{state.message}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (USD)" name="amount" error={state.errors?.amount}>
          <input
            id="amount"
            name="amount"
            className="field"
            inputMode="decimal"
            placeholder="40000"
            defaultValue={commission ? String(commission.amountCents / 100) : ''}
          />
        </Field>

        <Field label="Trigger" name="trigger" error={state.errors?.trigger}>
          <select
            id="trigger"
            name="trigger"
            className="field"
            defaultValue={commission?.trigger ?? 'ON_FUNDING'}
          >
            {(Object.keys(COMMISSION_TRIGGER_LABEL) as CommissionTrigger[]).map((value) => (
              <option key={value} value={value}>
                {COMMISSION_TRIGGER_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Status" name="status" error={state.errors?.status}>
          <select id="status" name="status" className="field" defaultValue={commission?.status ?? 'NOT_DUE'}>
            {(Object.keys(COMMISSION_STATUS_LABEL) as CommissionStatus[]).map((value) => (
              <option key={value} value={value}>
                {COMMISSION_STATUS_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Invoice number" name="invoiceNumber" error={state.errors?.invoiceNumber}>
          <input id="invoiceNumber" name="invoiceNumber" className="field" defaultValue={commission?.invoiceNumber ?? ''} />
        </Field>

        <Field label="Invoice sent" name="invoiceSentDate" error={state.errors?.invoiceSentDate}>
          <input
            id="invoiceSentDate"
            name="invoiceSentDate"
            type="date"
            className="field"
            defaultValue={toDateInputValue(commission?.invoiceSentDate)}
          />
        </Field>

        <Field label="Payment due" name="paymentDueDate" error={state.errors?.paymentDueDate}>
          <input
            id="paymentDueDate"
            name="paymentDueDate"
            type="date"
            className="field"
            defaultValue={toDateInputValue(commission?.paymentDueDate)}
          />
        </Field>

        <Field label="Payment received" name="paymentReceivedDate" error={state.errors?.paymentReceivedDate}>
          <input
            id="paymentReceivedDate"
            name="paymentReceivedDate"
            type="date"
            className="field"
            defaultValue={toDateInputValue(commission?.paymentReceivedDate)}
          />
        </Field>

        <Field
          label="Amount received (USD)"
          name="amountReceived"
          error={state.errors?.amountReceived}
          hint="Leave blank until payment lands. A lower figure is flagged as a short payment."
        >
          <input
            id="amountReceived"
            name="amountReceived"
            className="field"
            inputMode="decimal"
            defaultValue={commission?.amountReceivedCents != null ? String(commission.amountReceivedCents / 100) : ''}
          />
        </Field>

        <Field label="Notes" name="notes" error={state.errors?.notes} className="sm:col-span-2">
          <textarea id="notes" name="notes" className="field" rows={2} defaultValue={commission?.notes ?? ''} />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        {onDone ? (
          <button type="button" className="btn-ghost" onClick={onDone}>
            Cancel
          </button>
        ) : null}
        <SubmitButton className="btn-accent">{commission ? 'Save commission' : 'Add commission'}</SubmitButton>
      </div>
    </form>
  );
}

export function CommissionPanel({ clientId, commission }: { clientId: string; commission?: Commission }) {
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <button type="button" className={commission ? 'btn-quiet' : 'btn-ghost'} onClick={() => setOpen(true)}>
        {commission ? 'Edit' : '+ Add commission'}
      </button>
    );
  }
  return <CommissionEditor clientId={clientId} commission={commission} onDone={() => setOpen(false)} />;
}
