import { getDb } from '@/server/container';
import { getLookups } from '@/server/services/lookups';
import { RequisitionForm } from '@/components/verify/RequisitionForm';
import { emptyForm } from '@/components/verify/form-state';
import { todayIso } from '@/lib/format';

export const metadata = { title: 'New requisition - MFR Tracker' };

export default async function NewRequisitionPage() {
  const lookups = await getLookups(await getDb());
  return (
    <div className="mx-auto max-w-4xl space-y-3">
      <h1 className="text-xl font-semibold">New requisition</h1>
      <p className="text-sm text-stone-600">Choose the crew first. Its pre-printed parts appear as rows. Rows with no quantity are dropped when you post.</p>
      <div className="rounded border border-stone-300 bg-white p-3">
        <RequisitionForm lookups={lookups} initial={emptyForm(todayIso())} mode="new" highlight={false} />
      </div>
    </div>
  );
}
