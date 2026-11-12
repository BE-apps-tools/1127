import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requirePageUser } from '@/server/auth/guard';
import { getDb } from '@/server/container';
import { getLookups } from '@/server/services/lookups';
import { getRequisition, nextUnverified } from '@/server/services/requisitions';
import { Badge } from '@/components/ui/Badge';
import { buttonClass } from '@/components/ui/Button';
import { ImagePane } from '@/components/verify/ImagePane';
import { RequisitionForm } from '@/components/verify/RequisitionForm';
import { RequisitionActions } from '@/components/verify/RequisitionActions';
import { fromRequisition } from '@/components/verify/form-state';
import { fmtDate } from '@/lib/format';

export const metadata = { title: 'Requisition - MFR Tracker' };

export default async function RequisitionPage({ params }: { params: Promise<{ id: string }> }) {
  const id = Number((await params).id);
  if (!Number.isInteger(id) || id < 1) notFound();
  const user = await requirePageUser();
  const db = await getDb();
  const detail = await getRequisition(db, id);
  if (!detail) notFound();
  const [lookups, next] = await Promise.all([getLookups(db), nextUnverified(db, id)]);
  const isVoid = detail.status === 'void';
  const verified = detail.verifiedAt != null;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-semibold">{detail.reqNumber}</h1>
        {isVoid ? <Badge tone="red">Void</Badge> : verified ? <Badge tone="green">Verified</Badge> : <Badge tone="amber">Unverified</Badge>}
        <Badge tone="gray">{detail.source === 'seed' ? 'Backlog' : detail.source === 'scan' ? 'Scan' : 'Entered by hand'}</Badge>
        <span className="text-sm text-stone-600">
          {detail.crewName}, PB {detail.pbLocation}, {fmtDate(detail.requestDate)}
        </span>
        <div className="ml-auto flex items-center gap-2">
          {next ? (
            <Link href={`/requisitions/${next}`} className={buttonClass('secondary')}>
              Next unverified
            </Link>
          ) : null}
          {!isVoid ? <RequisitionActions requisitionId={id} verified={verified} isAdmin={user.role === 'admin'} /> : null}
        </div>
      </div>
      {isVoid ? (
        <p role="status" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          Voided: {detail.voidReason}. Void requisitions are left out of the tracker totals and the matrix.
        </p>
      ) : null}

      <div className={detail.scanPageId ? 'grid gap-4 lg:grid-cols-2' : 'max-w-4xl'}>
        {detail.scanPageId ? (
          <div className="lg:sticky lg:top-2 lg:h-[calc(100vh-8rem)]">
            <ImagePane key={detail.scanPageId} pageId={detail.scanPageId} canRotate={false} />
          </div>
        ) : null}
        <div className="space-y-4">
          <div className="rounded border border-stone-300 bg-white p-3">
            <RequisitionForm
              key={`${detail.id}-${detail.updatedAt}`}
              lookups={lookups}
              initial={fromRequisition(detail)}
              mode="edit"
              requisitionId={id}
              highlight={!verified}
              disabled={isVoid}
            />
          </div>
          <section aria-labelledby="history" className="rounded border border-stone-300 bg-white p-3">
            <h2 id="history" className="mb-2 text-sm font-semibold">
              History
            </h2>
            {detail.auditEntries.length === 0 ? (
              <p className="text-sm text-stone-600">No changes recorded yet.</p>
            ) : (
              <ul className="space-y-1 text-sm">
                {[...detail.auditEntries].reverse().map((a) => (
                  <li key={a.id} className="flex gap-2">
                    <span className="w-44 flex-none text-xs text-stone-500">{new Date(a.at).toLocaleString('en-US')}</span>
                    <span className="flex-none font-medium">{a.action.replace('requisition.', '').replace('lines.', '')}</span>
                    <span className="text-stone-600">{a.userName ?? 'System'}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
