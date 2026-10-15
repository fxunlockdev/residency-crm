'use client';

import { useFormStatus } from 'react-dom';
import clsx from 'clsx';

export function SubmitButton({
  children,
  pendingLabel,
  className = 'btn-primary',
  confirm,
}: {
  children: React.ReactNode;
  pendingLabel?: string;
  className?: string;
  confirm?: string;
}) {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      className={clsx(className)}
      disabled={pending}
      aria-busy={pending}
      onClick={(event) => {
        if (confirm && !window.confirm(confirm)) event.preventDefault();
      }}
    >
      {pending ? (
        <>
          <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-current border-t-transparent" aria-hidden />
          {pendingLabel ?? 'Saving…'}
        </>
      ) : (
        children
      )}
    </button>
  );
}
