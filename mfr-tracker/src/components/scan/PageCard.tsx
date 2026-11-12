'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Badge, type Tone } from '@/components/ui/Badge';
import { Button, buttonClass } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { extractPageRequest, postAction } from './api';

export interface PageCardData {
  id: number;
  filename: string;
  pageNumber: number;
  pageKey: string | null;
  status: string;
  requisitionId: number | null;
  reqNumber: string | null;
  duplicateOfPageId: number | null;
  extractionError: string | null;
}

const TONE: Record<string, Tone> = {
  uploaded: 'gray',
  extracting: 'blue',
  needs_review: 'amber',
  posted: 'green',
  duplicate: 'gray',
  rejected: 'gray',
  failed: 'red',
};
const LABEL: Record<string, string> = {
  uploaded: 'Waiting to read',
  extracting: 'Reading',
  needs_review: 'To verify',
  posted: 'Posted',
  duplicate: 'Duplicate',
  rejected: 'Rejected',
  failed: 'Failed',
};

export function PageCard({ page }: { page: PageCardData }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  async function run(fn: () => Promise<void>) {
    setBusy(true);
    try {
      await fn();
      router.refresh();
    } catch (err) {
      toast(err instanceof Error ? err.message : 'That did not work.', 'error');
    }
    setBusy(false);
  }

  const readNow = () => run(async () => {
    const res = await extractPageRequest(page.id);
    if (res.status === 'failed') throw new Error(res.error ?? 'Reading failed.');
  });

  return (
    <li className="flex gap-3 rounded border border-stone-300 bg-white p-2">
      {/* The thumbnail is the stored page image, scaled down by the browser. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={`/api/pages/${page.id}/image?variant=full`} alt={`Scan of ${page.filename}, page ${page.pageNumber}`} loading="lazy" className="h-28 w-36 flex-none rounded border border-stone-200 bg-stone-100 object-cover object-top" />
      <div className="flex min-w-0 flex-1 flex-col gap-1">
        <div className="flex items-center gap-2">
          <Badge tone={TONE[page.status] ?? 'gray'}>{LABEL[page.status] ?? page.status}</Badge>
          <span className="truncate text-xs text-stone-600">{page.pageKey ?? `page ${page.pageNumber}`}</span>
        </div>
        <p className="truncate text-xs text-stone-600" title={page.filename}>
          {page.filename}
        </p>
        {page.status === 'failed' && page.extractionError ? <p className="text-xs text-red-800">{page.extractionError}</p> : null}
        {page.status === 'duplicate' ? (
          <p className="text-xs text-stone-600">
            {page.reqNumber && page.requisitionId ? (
              <>
                Same form as{' '}
                <Link className="text-blue-700 underline" href={`/requisitions/${page.requisitionId}`}>
                  {page.reqNumber}
                </Link>
                .
              </>
            ) : (
              'Same image as an earlier page.'
            )}
          </p>
        ) : null}
        {page.status === 'posted' && page.requisitionId ? (
          <Link className="text-xs text-blue-700 underline" href={`/requisitions/${page.requisitionId}`}>
            {page.reqNumber}
          </Link>
        ) : null}
        <div className="mt-auto flex gap-2">
          {page.status === 'needs_review' ? (
            <Link href={`/verify/${page.id}`} className={buttonClass('primary', 'sm')}>
              Verify
            </Link>
          ) : null}
          {page.status === 'uploaded' || page.status === 'failed' ? (
            <Button size="sm" disabled={busy} onClick={readNow}>
              {page.status === 'failed' ? 'Retry' : 'Read now'}
            </Button>
          ) : null}
          {page.status === 'duplicate' ? (
            <Button
              size="sm"
              disabled={busy}
              onClick={() => run(async () => {
                await postAction(`/api/pages/${page.id}/reopen`);
                const res = await extractPageRequest(page.id);
                if (res.status === 'failed') throw new Error(res.error ?? 'Reading failed.');
              })}
            >
              Read anyway
            </Button>
          ) : null}
          {page.status === 'rejected' ? (
            <Button size="sm" disabled={busy} onClick={() => run(() => postAction(`/api/pages/${page.id}/reopen`))}>
              Reopen
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}
