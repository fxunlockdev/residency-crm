'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import type { Role } from '@prisma/client';
import { createUserAction, updateUserAction } from '@/server/user-actions';
import { Field } from '@/components/ui/form-field';
import { SubmitButton } from '@/components/ui/submit-button';
import { Alert } from '@/components/ui/alert';
import { ROLE_DESCRIPTION, ROLE_LABEL } from '@/lib/labels';
import type { FormState } from '@/server/client-actions';

type ExistingUser = { id: string; name: string; email: string; role: Role };

export function UserForm({ user }: { user?: ExistingUser }) {
  const action = user ? updateUserAction.bind(null, user.id) : createUserAction;
  const [state, formAction] = useActionState<FormState, FormData>(action, {});
  const [open, setOpen] = useState(!user);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.ok && !user) formRef.current?.reset();
    if (state.ok && user) setOpen(false);
  }, [state.ok, user]);

  if (user && !open) {
    return (
      <button type="button" className="btn-quiet" onClick={() => setOpen(true)}>
        Edit
      </button>
    );
  }

  return (
    <form ref={formRef} action={formAction} className="rounded-xl border border-line bg-cream-deep/40 p-5">
      {state.message ? (
        <div className="mb-4">
          <Alert tone={state.ok ? 'success' : 'error'}>{state.message}</Alert>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" name={`name-${user?.id ?? 'new'}`} error={state.errors?.name} required>
          <input
            id={`name-${user?.id ?? 'new'}`}
            name="name"
            className="field"
            defaultValue={user?.name ?? ''}
            required
          />
        </Field>

        <Field label="Email" name={`email-${user?.id ?? 'new'}`} error={state.errors?.email} required>
          <input
            id={`email-${user?.id ?? 'new'}`}
            name="email"
            type="email"
            className="field"
            defaultValue={user?.email ?? ''}
            required
          />
        </Field>

        <Field
          label="Role"
          name={`role-${user?.id ?? 'new'}`}
          error={state.errors?.role}
          hint={ROLE_DESCRIPTION[(user?.role ?? 'VIEWER') as Role]}
        >
          <select id={`role-${user?.id ?? 'new'}`} name="role" className="field" defaultValue={user?.role ?? 'VIEWER'}>
            {(Object.keys(ROLE_LABEL) as Role[]).map((role) => (
              <option key={role} value={role}>
                {ROLE_LABEL[role]}
              </option>
            ))}
          </select>
        </Field>

        <Field
          label={user ? 'New password' : 'Initial password'}
          name={`password-${user?.id ?? 'new'}`}
          error={state.errors?.password}
          hint={user ? 'Leave blank to keep the current password.' : 'At least 12 characters.'}
        >
          <input
            id={`password-${user?.id ?? 'new'}`}
            name="password"
            type="password"
            autoComplete="new-password"
            className="field"
            minLength={12}
          />
        </Field>
      </div>

      <div className="mt-5 flex justify-end gap-2">
        {user ? (
          <button type="button" className="btn-ghost" onClick={() => setOpen(false)}>
            Cancel
          </button>
        ) : null}
        <SubmitButton className="btn-accent">{user ? 'Save user' : 'Create user'}</SubmitButton>
      </div>
    </form>
  );
}
