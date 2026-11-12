import type { SelectHTMLAttributes } from 'react';
import { CONTROL, Field } from './Input';

export function Select({ label, hint, error, className = '', id, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string | null }) {
  return (
    <Field label={label} hint={hint} error={error} id={id}>
      {(fid) => (
        <select id={fid} className={`${CONTROL} ${className}`} {...rest}>
          {children}
        </select>
      )}
    </Field>
  );
}
