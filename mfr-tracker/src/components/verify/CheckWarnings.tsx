import type { CheckWarning } from '@/domain/types';

export function CheckWarnings({ warnings }: { warnings: CheckWarning[] }) {
  if (!warnings.length) return null;
  return (
    <ul className="space-y-1 rounded border border-amber-300 bg-amber-50 p-2 text-sm text-amber-950" aria-label="Quantity checks">
      {warnings.map((w) => (
        <li key={w.message}>Check: {w.message}</li>
      ))}
    </ul>
  );
}
