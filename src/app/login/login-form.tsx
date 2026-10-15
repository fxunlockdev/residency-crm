'use client';

import { useActionState } from 'react';
import { loginAction, type LoginState } from '@/server/auth-actions';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction] = useActionState<LoginState, FormData>(loginAction, {});

  return (
    <form action={formAction} className="space-y-5" noValidate>
      {state.error ? <Alert tone="error">{state.error}</Alert> : null}

      <div>
        <label className="field-label" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          required
          autoFocus
          className="field"
          placeholder="nick@residencyfirst.com"
        />
      </div>

      <div>
        <label className="field-label" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="field"
          placeholder="••••••••••"
        />
      </div>

      {next ? <input type="hidden" name="next" value={next} /> : null}

      <SubmitButton className="btn-primary w-full" pendingLabel="Signing in…">
        Sign in
      </SubmitButton>

      <p className="text-xs leading-relaxed text-ink-mute">
        Accounts are created by an administrator. If you cannot sign in, ask Nick to reset your password.
      </p>
    </form>
  );
}
