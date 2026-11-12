import Link from 'next/link';
import { getDb } from '@/server/container';
import { getMatrix } from '@/server/services/matrix';
import { buttonClass } from '@/components/ui/Button';
import { MatrixTable } from '@/components/matrix/MatrixTable';

export const metadata = { title: 'Matrix - MFR Tracker' };

export default async function MatrixPage({ searchParams }: { searchParams: Promise<{ mode?: string; verified?: string }> }) {
  const sp = await searchParams;
  const mode = sp.mode === 'requested' ? 'requested' : 'issued';
  const verifiedOnly = sp.verified === '1';
  const matrix = await getMatrix(await getDb(), { mode, verifiedOnly });

  const href = (m: string, v: boolean) => `/matrix?mode=${m}${v ? '&verified=1' : ''}`;
  const on = 'bg-blue-700 text-white';
  const off = 'bg-white text-stone-800 hover:bg-stone-100';
  const pill = (active: boolean) => `px-3 py-1.5 text-sm ${active ? on : off}`;
  const repeats = Object.values(matrix.cells).filter((c) => c.requisitionCount > 1).length;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">Matrix</h1>
        <div className="inline-flex overflow-hidden rounded border border-stone-300" role="group" aria-label="Quantity shown">
          <Link href={href('issued', verifiedOnly)} aria-current={mode === 'issued' ? 'true' : undefined} className={pill(mode === 'issued')}>
            Issued
          </Link>
          <Link href={href('requested', verifiedOnly)} aria-current={mode === 'requested' ? 'true' : undefined} className={pill(mode === 'requested')}>
            Requested
          </Link>
        </div>
        <Link href={href(mode, !verifiedOnly)} aria-pressed={verifiedOnly} className={`rounded border border-stone-300 ${pill(verifiedOnly)}`}>
          Verified only
        </Link>
        <span className="text-xs text-stone-600">{`${repeats} cells fed by more than one requisition`}</span>
        <a href={`/api/matrix/export?mode=${mode}&verifiedOnly=${verifiedOnly ? '1' : '0'}`} className={`${buttonClass('secondary')} ml-auto`}>
          Export Excel
        </a>
      </div>
      <MatrixTable matrix={matrix} />
    </div>
  );
}
