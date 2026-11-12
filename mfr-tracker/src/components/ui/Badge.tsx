import type { ReactNode } from 'react';

export type Tone = 'gray' | 'blue' | 'green' | 'amber' | 'red';

const TONE: Record<Tone, string> = {
  gray: 'bg-stone-200 text-stone-800',
  blue: 'bg-blue-100 text-blue-900',
  green: 'bg-green-100 text-green-900',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-900',
};

export function Badge({ tone = 'gray', children }: { tone?: Tone; children: ReactNode }) {
  return <span className={`inline-block rounded px-1.5 py-0.5 text-xs font-medium ${TONE[tone]}`}>{children}</span>;
}
