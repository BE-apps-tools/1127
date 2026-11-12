import type { InputHTMLAttributes } from 'react';
import { useId } from 'react';

export function Checkbox({ label, className = '', id, ...rest }: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> & { label: string }) {
  const auto = useId();
  const fid = id ?? auto;
  return (
    <div className="inline-flex items-center gap-2">
      <input id={fid} type="checkbox" className={`h-4 w-4 rounded border-stone-400 accent-blue-700 ${className}`} {...rest} />
      <label htmlFor={fid} className="text-sm text-stone-800">
        {label}
      </label>
    </div>
  );
}
