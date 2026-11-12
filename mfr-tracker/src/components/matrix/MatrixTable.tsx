import Link from 'next/link';
import { fmtNum } from '@/lib/format';
import { matrixCellKey, type Matrix } from '@/server/services/matrix';

const STICKY_HEAD = 'sticky top-0 z-10 border-b border-stone-300 bg-stone-100 px-2 py-1 text-xs font-semibold text-stone-700';
const STICKY_COL = 'sticky left-0 z-10 border-r border-stone-300 bg-white px-2 py-1 font-medium';

export function MatrixTable({ matrix }: { matrix: Matrix }) {
  if (matrix.rows.length === 0) {
    return (
      <p className="rounded border border-stone-300 bg-white p-4 text-sm text-stone-600">
        No quantities to show. Post a requisition, or switch off &quot;Verified only&quot;.
      </p>
    );
  }
  // Group the part columns under their crew, in column order.
  const groups: Array<{ crew: string; span: number }> = [];
  for (const c of matrix.columns) {
    const crew = c.crewCode ?? 'Other';
    const last = groups[groups.length - 1];
    if (last && last.crew === crew) last.span++;
    else groups.push({ crew, span: 1 });
  }
  const grand = Object.values(matrix.rowTotals).reduce((a, b) => a + b, 0);

  return (
    <div className="max-h-[75vh] overflow-auto rounded border border-stone-300 bg-white">
      <table className="border-collapse text-sm">
        <thead>
          <tr>
            <th className={`${STICKY_HEAD} left-0 z-20`} rowSpan={2} scope="col">
              PB
            </th>
            {groups.map((g, i) => (
              <th key={`${g.crew}-${i}`} colSpan={g.span} scope="colgroup" className={`${STICKY_HEAD} border-l border-stone-300 text-center`}>
                {g.crew.replace(/_/g, ' ')}
              </th>
            ))}
            <th rowSpan={2} scope="col" className={`${STICKY_HEAD} border-l border-stone-300 text-right`}>
              Total
            </th>
          </tr>
          <tr>
            {matrix.columns.map((c) => (
              <th key={c.partId} scope="col" title={c.label} className={`${STICKY_HEAD} top-6 whitespace-nowrap border-l border-stone-200 text-right`}>
                {c.partNumber}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.rows.map((r) => (
            <tr key={r.pbLocation} className="hover:bg-stone-50">
              <th scope="row" className={STICKY_COL}>
                {r.pbLocation}
              </th>
              {matrix.columns.map((c) => {
                const cell = matrix.cells[matrixCellKey(r.pbLocation, c.partId)];
                if (!cell) return <td key={c.partId} className="border-l border-stone-100 px-2 py-1" />;
                const repeat = cell.requisitionCount > 1;
                const href = `/tracker?${new URLSearchParams({ pb: r.pbLocation, part: String(c.partId) }).toString()}`;
                return (
                  <td key={c.partId} className={`border-l border-stone-100 px-2 py-1 text-right tabular-nums ${repeat ? 'bg-amber-100' : ''}`}>
                    <Link href={href} className="text-blue-800 hover:underline" title={`PB ${r.pbLocation}, ${c.partNumber}`}>
                      {fmtNum(cell.qty)}
                    </Link>
                    {repeat ? <sup className="ml-0.5 text-[10px] font-semibold text-amber-900">{`x${cell.requisitionCount}`}</sup> : null}
                  </td>
                );
              })}
              <td className="border-l border-stone-300 px-2 py-1 text-right font-semibold tabular-nums">{fmtNum(matrix.rowTotals[r.pbLocation] ?? 0)}</td>
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="font-semibold">
            <th scope="row" className={`${STICKY_COL} border-t border-stone-300 bg-stone-100`}>
              Total
            </th>
            {matrix.columns.map((c) => (
              <td key={c.partId} className="border-l border-t border-stone-300 bg-stone-100 px-2 py-1 text-right tabular-nums">
                {fmtNum(matrix.columnTotals[c.partId] ?? 0)}
              </td>
            ))}
            <td className="border-l border-t border-stone-300 bg-stone-100 px-2 py-1 text-right tabular-nums">{fmtNum(grand)}</td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
