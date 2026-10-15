import type { ReactNode } from 'react';

export function Field({
  label,
  name,
  error,
  hint,
  children,
  required,
  className,
}: {
  label: string;
  name: string;
  error?: string;
  hint?: ReactNode;
  children: ReactNode;
  required?: boolean;
  className?: string;
}) {
  const describedBy = [error ? `${name}-error` : null, hint ? `${name}-hint` : null].filter(Boolean).join(' ');

  return (
    <div className={className}>
      <label className="field-label" htmlFor={name}>
        {label}
        {required ? <span className="ml-1 text-pink-deep">*</span> : null}
      </label>
      <div aria-describedby={describedBy || undefined}>{children}</div>
      {hint ? (
        <p id={`${name}-hint`} className="field-hint">
          {hint}
        </p>
      ) : null}
      {error ? (
        <p id={`${name}-error`} className="field-error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function FormSection({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <section className="grid gap-6 border-b border-line py-8 first:pt-0 last:border-b-0 lg:grid-cols-[14rem_1fr] lg:gap-10">
      <div>
        <h2 className="font-serif text-base font-medium text-ink">{title}</h2>
        {description ? <p className="mt-1.5 text-sm leading-relaxed text-ink-mute">{description}</p> : null}
      </div>
      <div className="grid gap-5 sm:grid-cols-2">{children}</div>
    </section>
  );
}
