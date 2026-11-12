import Link from 'next/link';
import { getDb } from '@/server/container';
import { getLookups } from '@/server/services/lookups';
import { TRACKER_PAGE_SIZE, parseTrackerFilters, queryTracker, trackerFiltersToQuery } from '@/server/services/tracker';
import { buttonClass } from '@/components/ui/Button';
import { FilterBar } from '@/components/tracker/FilterBar';
import { TrackerTable } from '@/components/tracker/TrackerTable';
import { fmtNum } from '@/lib/format';

export const metadata = { title: 'Tracker - MFR Tracker' };

export default async function TrackerPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const filters = parseTrackerFilters(sp);
  const pageParam = Array.isArray(sp.page) ? sp.page[0] : sp.page;
  const page = Math.max(1, Number(pageParam) || 1);
  const db = await getDb();
  const [result, lookups] = await Promise.all([queryTracker(db, filters, { page, pageSize: TRACKER_PAGE_SIZE }), getLookups(db)]);
  const pages = Math.max(1, Math.ceil(result.totalLines / TRACKER_PAGE_SIZE));

  const base = trackerFiltersToQuery(filters);
  const link = (p: number) => {
    const q = new URLSearchParams(base);
    if (p > 1) q.set('page', String(p));
    return `/tracker?${q.toString()}`;
  };
  const exportHref = (format: 'csv' | 'xlsx') => {
    const q = new URLSearchParams(base);
    q.set('format', format);
    return `/api/tracker/export?${q.toString()}`;
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <h1 className="text-xl font-semibold">Tracker</h1>
        <div className="ml-auto flex gap-2">
          <a href={exportHref('csv')} className={buttonClass('secondary')}>
            Export CSV
          </a>
          <a href={exportHref('xlsx')} className={buttonClass('secondary')}>
            Export Excel
          </a>
          <Link href="/requisitions/new" className={buttonClass('primary')}>
            New requisition
          </Link>
        </div>
      </div>
      <FilterBar filters={filters} lookups={lookups} />
      <TrackerTable rows={result.rows} />
      <div className="flex flex-wrap items-center gap-4 rounded border border-stone-300 bg-white px-3 py-2 text-sm" aria-label="Totals for the current filter">
        <span>{`${fmtNum(result.totalLines)} lines`}</span>
        <span>{`${fmtNum(result.totalRequisitions)} requisitions`}</span>
        <span>{`Requested ${fmtNum(result.sumRequested)}`}</span>
        <span>{`Issued ${fmtNum(result.sumIssued)}`}</span>
        <nav aria-label="Pages" className="ml-auto flex items-center gap-2">
          {page > 1 ? (
            <Link href={link(page - 1)} className={buttonClass('secondary', 'sm')}>
              Previous
            </Link>
          ) : null}
          <span className="text-xs text-stone-600">{`Page ${page} of ${pages}`}</span>
          {page < pages ? (
            <Link href={link(page + 1)} className={buttonClass('secondary', 'sm')}>
              Next
            </Link>
          ) : null}
        </nav>
      </div>
    </div>
  );
}
