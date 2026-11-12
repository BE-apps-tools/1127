import Link from 'next/link';
import { Button } from '@/components/ui/Button';
import { fmtDate } from '@/lib/format';
import type { DuplicateRef } from '@/server/services/requisitions';

export function DuplicateBanner({
  duplicates,
  busy,
  onPostAnyway,
  onMarkDuplicate,
}: {
  duplicates: DuplicateRef[];
  busy: boolean;
  onPostAnyway?: () => void;
  onMarkDuplicate?: (requisitionId: number) => void;
}) {
  if (!duplicates.length) return null;
  return (
    <div role="alert" className="rounded border border-amber-400 bg-amber-50 p-3 text-sm text-amber-950">
      <p className="font-medium">Possible duplicate. A posted requisition has the same crew, PB, date, parts and quantities.</p>
      <ul className="mt-1 space-y-1">
        {duplicates.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center gap-2">
            <Link href={`/requisitions/${d.id}`} target="_blank" className="font-medium text-blue-800 underline">
              {d.reqNumber}
            </Link>
            <span className="text-xs">
              {d.crewCode}, PB {d.pbLocation}, {fmtDate(d.requestDate)}
            </span>
            {onMarkDuplicate ? (
              <Button size="sm" disabled={busy} onClick={() => onMarkDuplicate(d.id)}>
                Mark duplicate of {d.reqNumber}
              </Button>
            ) : null}
          </li>
        ))}
      </ul>
      {onPostAnyway ? (
        <div className="mt-2">
          <Button size="sm" variant="danger" disabled={busy} onClick={onPostAnyway}>
            Post anyway
          </Button>
        </div>
      ) : null}
    </div>
  );
}
