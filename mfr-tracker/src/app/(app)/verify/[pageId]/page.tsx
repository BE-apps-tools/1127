import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { getDb } from '@/server/container';
import { getLookups } from '@/server/services/lookups';
import { getDraft, getPage, getQueuePosition, nextPageToVerify } from '@/server/services/scans';
import { buttonClass } from '@/components/ui/Button';
import { ImagePane } from '@/components/verify/ImagePane';
import { RequisitionForm } from '@/components/verify/RequisitionForm';
import { fromDraft } from '@/components/verify/form-state';
import { AppError } from '@/server/errors';
import { todayIso } from '@/lib/format';

export const metadata = { title: 'Verify - MFR Tracker' };

export default async function VerifyPage({ params }: { params: Promise<{ pageId: string }> }) {
  const id = Number((await params).pageId);
  if (!Number.isInteger(id) || id < 1) notFound();
  const db = await getDb();
  const page = await getPage(db, id).catch((e) => {
    if (e instanceof AppError && e.code === 'not_found') notFound();
    throw e;
  });
  if (page.status === 'posted' && page.requisitionId) redirect(`/requisitions/${page.requisitionId}`);
  if (page.status !== 'needs_review') {
    return (
      <div className="space-y-3">
        <h1 className="text-xl font-semibold">Verify</h1>
        <p className="text-sm text-stone-700">
          This page is {page.status.replace('_', ' ')}, so it is not waiting for review.
        </p>
        <Link href="/inbox" className={buttonClass('primary')}>
          Back to the inbox
        </Link>
      </div>
    );
  }

  const lookups = await getLookups(db);
  const { draft, duplicates } = await getDraft(db, id, lookups, todayIso());
  const [pos, after] = await Promise.all([getQueuePosition(db, id), nextPageToVerify(db, id)]);
  let next = after;
  if (!next) {
    const first = await nextPageToVerify(db);
    next = first !== id ? first : null;
  }

  return (
    <div className="space-y-2">
      <h1 className="text-lg font-semibold">
        Page {pos.position} of {pos.total} to verify
        <span className="ml-2 text-sm font-normal text-stone-600">
          {page.filename}, page {page.pageNumber}
        </span>
      </h1>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="lg:sticky lg:top-2 lg:h-[calc(100vh-6rem)]">
          <ImagePane key={id} pageId={id} canRotate />
        </div>
        <div className="rounded border border-stone-300 bg-white p-3">
          {!draft.lines.length && !page.extraction ? (
            <p className="mb-3 rounded border border-stone-300 bg-stone-50 p-2 text-sm text-stone-700">
              AI reading is off for this page. Key the form from the scan.
            </p>
          ) : null}
          <RequisitionForm
            key={`${id}-${page.extractionModel ?? 'none'}-${page.rotationApplied}`}
            lookups={lookups}
            initial={fromDraft(draft, lookups)}
            mode="verify"
            scanPageId={id}
            nextPageId={next}
            initialDuplicates={duplicates}
            highlight
          />
        </div>
      </div>
    </div>
  );
}
