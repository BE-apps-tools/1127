import type { ButtonHTMLAttributes } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';
type Size = 'sm' | 'md';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-blue-700 text-white hover:bg-blue-800 border-blue-700',
  secondary: 'bg-white text-stone-900 hover:bg-stone-100 border-stone-300',
  danger: 'bg-red-700 text-white hover:bg-red-800 border-red-700',
  ghost: 'bg-transparent text-stone-700 hover:bg-stone-200 border-transparent',
};
const SIZE: Record<Size, string> = { sm: 'px-2 py-1 text-xs', md: 'px-3 py-1.5 text-sm' };

export function buttonClass(variant: Variant = 'secondary', size: Size = 'md'): string {
  return `inline-flex items-center justify-center gap-1 rounded border font-medium disabled:cursor-not-allowed disabled:opacity-50 ${VARIANT[variant]} ${SIZE[size]}`;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  className = '',
  type = 'button',
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button type={type} className={`${buttonClass(variant, size)} ${className}`} {...rest} />;
}
