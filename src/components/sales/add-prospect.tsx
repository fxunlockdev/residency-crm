'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { addProspectAction } from '@/server/sales-actions';
import { Field } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import type { FormState } from '@/server/client-actions';

/** Four fields, because the point is to capture a lead in seconds. */
export function AddProspect() {
  const [state, formAction] = useActionState<FormState, FormData>(addProspectAction, {});
  const [open, setOpen] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) {
      formRef.current?.reset();
      setOpen(false);
    }
  }, [state.ok]);

  if (!open) {
    return (
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" className="btn-accent" onClick={() => setOpen(true)}>
          + Add prospect
        </button>
        {state.ok && state.message ? (
          <span role="status" className="text-sm text-stage-emerald">
            {state.message}
          </span>
        ) : null}
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="surface w-full max-w-2xl p-5">
      <h2 className="h-section mb-4">New prospect</h2>
      {state.message && !state.ok ? (
        <div className="mb-4">
          <Alert tone="error">{state.message}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name="fullName" error={state.errors?.fullName} required>
          <input id="fullName" name="fullName" className="field" required autoFocus maxLength={160} />
        </Field>

        <Field label="Phone / WhatsApp" name="phone" error={state.errors?.phone}>
          <input id="phone" name="phone" className="field" inputMode="tel" />
        </Field>

        <Field label="Country" name="countryOfBirth" error={state.errors?.countryOfBirth}>
          <input id="countryOfBirth" name="countryOfBirth" className="field" />
        </Field>

        <Field
          label="Potential revenue (USD)"
          name="potentialRevenue"
          error={state.errors?.potentialRevenue}
          hint="What we expect to earn. Replaced by the real figure once a commission is recorded."
        >
          <input id="potentialRevenue" name="potentialRevenue" className="field" inputMode="decimal" placeholder="40000" />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <SubmitButton className="btn-accent">Add to board</SubmitButton>
      </div>
    </form>
  );
}
