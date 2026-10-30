'use client';

import { useActionState } from 'react';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { sendTestAction } from '@/server/newsletter-actions';
import type { FormState } from '@/server/client-actions';

/**
 * Sending one to yourself before sending it to everybody.
 *
 * To your own address only. The body is whatever the author typed, and it
 * leaves from the firm's verified sending domain, so a free recipient field
 * would be a way to send convincing mail from the firm to anyone.
 */
export function TestSend({ newsletterId, address }: { newsletterId: string; address: string }) {
  const [state, formAction] = useActionState<FormState, FormData>(sendTestAction, {});

  return (
    <form action={formAction} className="mt-4">
      <input type="hidden" name="newsletterId" value={newsletterId} />
      {state.message ? (
        <div className="mb-3">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      ) : null}
      <SubmitButton className="btn-quiet" pendingLabel="Sending…">
        Send a test to {address}
      </SubmitButton>
    </form>
  );
}
