import type { InputHTMLAttributes, ReactNode } from 'react';
import { useId } from 'react';

export const CONTROL = 'w-full rounded border border-stone-300 bg-white px-2 py-1.5 text-sm text-stone-900 disabled:bg-stone-100';

export function Field({ label, hint, error, children, id }: { label: string; hint?: string; error?: string | null; children: (id: string) => ReactNode; id?: string }) {
  const auto = useId();
  const fieldId = id ?? auto;
  return (
    <div>
      <label htmlFor={fieldId} className="mb-1 block text-xs font-medium text-stone-700">
        {label}
      </label>
      {children(fieldId)}
      {hint ? <p className="mt-1 text-xs text-stone-500">{hint}</p> : null}
      {error ? (
        <p role="alert" className="mt-1 text-xs text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Input({ label, hint, error, className = '', id, ...rest }: InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error} id={id}>
      {(fid) => <input id={fid} className={`${CONTROL} ${error ? 'border-red-600' : ''} ${className}`} aria-invalid={error ? true : undefined} {...rest} />}
    </Field>
  );
}
