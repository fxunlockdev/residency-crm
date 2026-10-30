'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import type { Newsletter } from '@prisma/client';
import { Field, FormSection } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import type { FormState } from '@/server/client-actions';

export function NewsletterForm({
  action,
  letter,
  submitLabel,
  cancelHref,
}: {
  action: (state: FormState, formData: FormData) => Promise<FormState>;
  letter?: Newsletter | null;
  submitLabel: string;
  cancelHref: string;
}) {
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const errors = state.errors ?? {};

  return (
    <form action={formAction} noValidate>
      {letter ? <input type="hidden" name="newsletterId" value={letter.id} /> : null}

      {state.message ? (
        <div className="mb-6">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      ) : null}

      <FormSection title="Email" description="What lands in the inbox.">
        <Field label="Subject" name="subject" error={errors.subject} required className="sm:col-span-2">
          <input
            id="subject"
            name="subject"
            defaultValue={letter?.subject ?? ''}
            className="field"
            required
            maxLength={160}
          />
        </Field>

        <Field
          label="Preview line"
          name="preheader"
          error={errors.preheader}
          className="sm:col-span-2"
          hint="The grey text shown beside the subject in most inboxes. Leave blank to repeat the subject."
        >
          <input
            id="preheader"
            name="preheader"
            defaultValue={letter?.preheader ?? ''}
            className="field"
            maxLength={200}
          />
        </Field>

        <Field
          label="Body"
          name="bodyMarkdown"
          error={errors.bodyMarkdown}
          required
          className="sm:col-span-2"
          hint="Markdown. ## for headings, - for bullets, [text](https://…) for links. The unsubscribe line is added for you."
        >
          <textarea
            id="bodyMarkdown"
            name="bodyMarkdown"
            defaultValue={letter?.bodyMarkdown ?? ''}
            className="field font-mono text-[13px] leading-relaxed"
            rows={20}
            required
            spellCheck
          />
        </Field>
      </FormSection>

      <div className="mt-8 flex flex-wrap items-center gap-3">
        <SubmitButton>{submitLabel}</SubmitButton>
        <Link href={cancelHref} className="btn-quiet">
          Cancel
        </Link>
      </div>
    </form>
  );
}
