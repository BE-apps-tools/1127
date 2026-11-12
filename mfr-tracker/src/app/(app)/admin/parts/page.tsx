import { requirePageUser } from '@/server/auth/guard';
import { getDb } from '@/server/container';
import { listParts } from '@/server/services/parts';
import { Forbidden } from '@/components/admin/Forbidden';
import { PartsAdmin } from '@/components/admin/PartsAdmin';
import { Button } from '@/components/ui/Button';
import { CONTROL } from '@/components/ui/Input';
import Link from 'next/link';

export const metadata = { title: 'Parts - MFR Tracker' };

export default async function PartsPage({ searchParams }: { searchParams: Promise<{ q?: string; review?: string; inactive?: string }> }) {
  const user = await requirePageUser();
  if (user.role !== 'admin') return <Forbidden />;
  const sp = await searchParams;
  const parts = await listParts(await getDb(), { q: sp.q, review: sp.review === '1', includeInactive: sp.inactive === '1' });
  return (
    <div className="space-y-3">
      <h1 className="text-xl font-semibold">Parts</h1>
      <form method="get" className="flex flex-wrap items-end gap-3" aria-label="Part filters">
        <label className="flex flex-col gap-0.5 text-xs font-medium text-stone-700">
          Search
          <input type="search" name="q" defaultValue={sp.q ?? ''} className={`${CONTROL} w-56`} />
        </label>
        <label className="flex items-center gap-1 pb-2 text-sm">
          <input type="checkbox" name="review" value="1" defaultChecked={sp.review === '1'} className="h-4 w-4 accent-blue-700" />
          Needs review
        </label>
        <label className="flex items-center gap-1 pb-2 text-sm">
          <input type="checkbox" name="inactive" value="1" defaultChecked={sp.inactive === '1'} className="h-4 w-4 accent-blue-700" />
          Show merged parts
        </label>
        <Button type="submit" variant="primary">
          Apply
        </Button>
        <Link href="/admin/parts" className="pb-2 text-sm text-blue-700 underline">
          Clear
        </Link>
      </form>
      <PartsAdmin parts={parts} />
    </div>
  );
}
