'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { createMeetingAction } from '@/server/meeting-actions';
import { Field } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { MEETING_TYPE_LABEL } from '@/lib/labels';
import type { FormState } from '@/server/client-actions';
import type { MeetingType } from '@prisma/client';

/** "yyyy-mm-ddThh:mm" in the viewer's own clock, which is what the input expects. */
function localDateTimeValue(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}T${pad(now.getHours())}:${pad(now.getMinutes())}`;
}

export function MeetingComposer({ clientId }: { clientId: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(createMeetingAction, {});
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
      <div>
        {state.ok && state.message ? (
          <div className="mb-4">
            <Alert tone="success">{state.message}</Alert>
          </div>
        ) : null}
        <button type="button" className="btn-ghost" onClick={() => setOpen(true)}>
          + Log a meeting
        </button>
      </div>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="rounded-xl2 border border-line bg-cream-deep/40 p-5">
      <input type="hidden" name="clientId" value={clientId} />
      {state.message && !state.ok ? (
        <div className="mb-4">
          <Alert tone="error">{state.message}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Date and time" name="occurredAt" error={state.errors?.occurredAt} required>
          <input
            id="occurredAt"
            name="occurredAt"
            type="datetime-local"
            className="field"
            required
            defaultValue={localDateTimeValue()}
          />
        </Field>

        <Field label="Type" name="type" error={state.errors?.type} required>
          <select id="type" name="type" className="field" defaultValue="CALL">
            {(Object.keys(MEETING_TYPE_LABEL) as MeetingType[]).map((value) => (
              <option key={value} value={value}>
                {MEETING_TYPE_LABEL[value]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label="Attendees"
          name="attendees"
          error={state.errors?.attendees}
          className="sm:col-span-2"
          hint="For example: client, attorney, regional centre."
        >
          <input id="attendees" name="attendees" className="field" />
        </Field>

        <Field label="Summary" name="summary" error={state.errors?.summary} className="sm:col-span-2">
          <textarea
            id="summary"
            name="summary"
            className="field"
            rows={4}
            placeholder="Key points and agreed next steps"
          />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
          Cancel
        </button>
        <SubmitButton className="btn-accent">Save meeting</SubmitButton>
      </div>
    </form>
  );
}
