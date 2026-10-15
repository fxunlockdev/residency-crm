'use client';

import { useActionState, useEffect, useRef } from 'react';
import { uploadDocumentAction } from '@/server/document-actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { DOCUMENT_KIND_LABEL } from '@/lib/labels';
import type { DocumentKind } from '@prisma/client';
import type { FormState } from '@/server/client-actions';

export function DocumentUploader({ clientId }: { clientId: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(uploadDocumentAction, {});
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok) formRef.current?.reset();
  }, [state.ok]);

  return (
    <form ref={formRef} action={formAction} className="space-y-3">
      <input type="hidden" name="clientId" value={clientId} />
      {state.message ? <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert> : null}

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-[10rem]">
          <label className="field-label" htmlFor="kind">
            Type
          </label>
          <select id="kind" name="kind" className="field" defaultValue="I526E_RECEIPT">
            {(Object.keys(DOCUMENT_KIND_LABEL) as DocumentKind[]).map((value) => (
              <option key={value} value={value}>
                {DOCUMENT_KIND_LABEL[value]}
              </option>
            ))}
          </select>
        </div>

        <div className="min-w-[14rem] flex-1">
          <label className="field-label" htmlFor="file">
            File
          </label>
          <input
            id="file"
            name="file"
            type="file"
            required
            accept="application/pdf,image/png,image/jpeg,image/webp,image/heic"
            className="field cursor-pointer py-2 text-sm file:mr-3 file:cursor-pointer file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-cream hover:file:bg-pink-deep"
          />
        </div>

        <SubmitButton className="btn-ghost" pendingLabel="Uploading…">
          Upload
        </SubmitButton>
      </div>

      <p className="text-xs text-ink-mute">
        PDF or image, up to 10 MB. Files are private — only signed-in users can open them. Do not upload passports,
        identity documents, source-of-funds evidence or bank details.
      </p>
    </form>
  );
}
