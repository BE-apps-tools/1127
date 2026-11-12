import Link from 'next/link';
import { getDb } from '@/server/container';
import { countPagesByStatus, listPages, nextPageToVerify, type PageStatus } from '@/server/services/scans';
import { Tabs } from '@/components/ui/Tabs';
import { buttonClass } from '@/components/ui/Button';
import { UploadZone } from '@/components/scan/UploadZone';
import { PageCard } from '@/components/scan/PageCard';

export const metadata = { title: 'Inbox - MFR Tracker' };

const TABS: Array<{ key: string; label: string; statuses: PageStatus[]; empty: string }> = [
  { key: 'review', label: 'To verify', statuses: ['needs_review'], empty: 'Nothing to verify. Upload a scan to get started.' },
  { key: 'processing', label: 'Processing', statuses: ['uploaded', 'extracting'], empty: 'No pages are being read.' },
  { key: 'failed', label: 'Failed', statuses: ['failed'], empty: 'No failed reads.' },
  { key: 'duplicates', label: 'Duplicates', statuses: ['duplicate'], empty: 'No duplicate scans.' },
  { key: 'rejected', label: 'Rejected', statuses: ['rejected'], empty: 'No rejected pages.' },
  { key: 'posted', label: 'Posted', statuses: ['posted'], empty: 'No posted pages yet.' },
];
const STEP = 50;

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ tab?: string; limit?: string }> }) {
  const sp = await searchParams;
  const tab = TABS.find((t) => t.key === sp.tab) ?? TABS[0];
  const limit = Math.min(Math.max(Number(sp.limit) || STEP, STEP), 1000);
  const db = await getDb();
  const [counts, pages, first] = await Promise.all([
    countPagesByStatus(db),
    listPages(db, { status: tab.statuses, limit, offset: 0 }),
    tab.key === 'review' ? nextPageToVerify(db) : Promise.resolve(null),
  ]);
  const total = tab.statuses.reduce((n, s) => n + counts[s], 0);

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-semibold">Inbox</h1>
      <UploadZone />
      <Tabs
        label="Inbox tabs"
        items={TABS.map((t) => ({
          label: t.label,
          href: `/inbox?tab=${t.key}`,
          count: t.statuses.reduce((n, s) => n + counts[s], 0),
          active: t.key === tab.key,
        }))}
      />
      {first ? (
        <Link href={`/verify/${first}`} className={buttonClass('primary')}>
          Start verifying
        </Link>
      ) : null}
      {pages.length === 0 ? (
        <p className="text-sm text-stone-600">{tab.empty}</p>
      ) : (
        <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {pages.map((p) => (
            <PageCard
              key={p.id}
              page={{
                id: p.id,
                filename: p.filename,
                pageNumber: p.pageNumber,
                pageKey: p.pageKey,
                status: p.status,
                requisitionId: p.requisitionId,
                reqNumber: p.reqNumber,
                duplicateOfPageId: p.duplicateOfPageId,
                extractionError: p.extractionError,
              }}
            />
          ))}
        </ul>
      )}
      {pages.length < total ? (
        <Link href={`/inbox?tab=${tab.key}&limit=${limit + STEP}`} className={buttonClass('secondary')}>
          Load more ({total - pages.length} left)
        </Link>
      ) : null}
    </div>
  );
}
