'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/Button';
import { useToast } from '@/components/ui/Toast';
import { extractPageRequest, createBatch, uploadPage } from './api';
import { prepareScan } from './canvas';
import { imageToCanvas, pdfPageCount, renderPdfPage } from './pdf';
import { processPage, runPipeline, type PageProgress, type PageState, type PageTask } from './pipeline';

const MAX_PAGES = 300;

interface UploadTask extends PageTask {
  file: File;
  pdfPage: number | null;
  batchId: number;
}

interface Row {
  key: string;
  label: string;
  state: PageState;
  error?: string;
  pageId?: number;
  rotationConfident?: boolean;
}

const STATE_TEXT: Record<PageState, string> = {
  rendering: 'Rendering',
  uploading: 'Uploading',
  reading: 'Reading',
  ready: 'Ready to verify',
  duplicate: 'Duplicate scan',
  failed: 'Failed',
};

const isPdf = (f: File) => f.type === 'application/pdf' || /\.pdf$/i.test(f.name);
const isImage = (f: File) => /^image\/(jpeg|png)$/.test(f.type) || /\.(jpe?g|png)$/i.test(f.name);

async function renderTask(t: UploadTask) {
  const canvas = t.pdfPage ? await renderPdfPage(t.file, t.pdfPage) : await imageToCanvas(t.file);
  return prepareScan(canvas);
}

export function UploadZone() {
  const router = useRouter();
  const toast = useToast();
  const input = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [busy, setBusy] = useState(false);
  const [over, setOver] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const tasks = useRef(new Map<string, UploadTask>());
  const rotation = useRef(new Map<string, boolean>());

  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const deps = {
    render: renderTask,
    upload: async (t: UploadTask, r: Awaited<ReturnType<typeof renderTask>>) => {
      rotation.current.set(t.key, r.rotationConfident);
      patch(t.key, { rotationConfident: r.rotationConfident });
      return uploadPage(t.batchId, r, {
        pageNumber: t.pageNumber,
        sha256: r.sha256,
        width: r.width,
        height: r.height,
        rotationApplied: r.rotationApplied,
        rotationConfident: r.rotationConfident,
      });
    },
    extract: (id: number) => extractPageRequest(id),
  };

  const onProgress = (p: PageProgress<UploadTask>) =>
    patch(p.task.key, { state: p.state, error: p.error, pageId: p.pageId });

  async function start(list: FileList | File[]) {
    setMessage(null);
    const files = [...list];
    const pdfs = files.filter(isPdf);
    const images = files.filter((f) => !isPdf(f) && isImage(f));
    const rejected = files.filter((f) => !isPdf(f) && !isImage(f));
    if (rejected.length) {
      setMessage(`Only PDF, JPG and PNG files can be uploaded. Skipped: ${rejected.map((f) => f.name).join(', ')}.`);
      if (!pdfs.length && !images.length) return;
    }
    setBusy(true);
    try {
      const groups: Array<{ name: string; files: Array<{ file: File; pdfPage: number | null }> }> = [];
      for (const pdf of pdfs) {
        const n = await pdfPageCount(pdf);
        if (n > MAX_PAGES) {
          setMessage(`${pdf.name} has ${n} pages. A single upload can hold at most ${MAX_PAGES} pages. Split the file and try again.`);
          setBusy(false);
          return;
        }
        groups.push({ name: pdf.name, files: Array.from({ length: n }, (_, i) => ({ file: pdf, pdfPage: i + 1 })) });
      }
      if (images.length > MAX_PAGES) {
        setMessage(`That is ${images.length} images. A single upload can hold at most ${MAX_PAGES} pages.`);
        setBusy(false);
        return;
      }
      if (images.length) {
        groups.push({
          name: images.length === 1 ? images[0].name : `${images[0].name} and ${images.length - 1} more`,
          files: images.map((file) => ({ file, pdfPage: null })),
        });
      }

      const all: UploadTask[] = [];
      for (const g of groups) {
        const batch = await createBatch(g.name, g.files.length);
        g.files.forEach((f, i) => {
          const key = `${batch.id}-${i + 1}`;
          all.push({
            key,
            label: f.pdfPage ? `${g.name}, page ${f.pdfPage}` : f.file.name,
            pageNumber: i + 1,
            file: f.file,
            pdfPage: f.pdfPage,
            batchId: batch.id,
          });
        });
      }
      for (const t of all) tasks.current.set(t.key, t);
      setRows(all.map((t) => ({ key: t.key, label: t.label, state: 'rendering' as PageState })));

      const results = await runPipeline(all, deps, { onProgress });
      const ok = results.filter((r) => r.state === 'ready').length;
      const failed = results.filter((r) => r.state === 'failed').length;
      toast(`${ok} page${ok === 1 ? '' : 's'} ready to verify${failed ? `, ${failed} failed` : ''}.`, failed ? 'error' : 'info');
      router.refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : 'The upload could not start.');
    }
    setBusy(false);
  }

  async function retry(row: Row) {
    const task = tasks.current.get(row.key);
    if (!task) return;
    patch(row.key, { state: 'reading', error: undefined });
    if (row.pageId) {
      // The page is already stored; only the read needs another try.
      const res = await extractPageRequest(row.pageId).catch((e: unknown) => ({ status: 'failed', error: e instanceof Error ? e.message : 'Reading failed.' }));
      patch(row.key, res.status === 'failed' ? { state: 'failed', error: res.error ?? 'Reading failed.' } : { state: 'ready' });
    } else {
      await processPage(task, deps, onProgress);
    }
    router.refresh();
  }

  return (
    <section aria-label="Upload scans" className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          if (!busy && e.dataTransfer.files.length) void start(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-2 rounded border-2 border-dashed p-6 text-center ${over ? 'border-blue-700 bg-blue-50' : 'border-stone-300 bg-white'}`}
      >
        <p className="text-sm text-stone-700">Drop PDF, JPG or PNG scans here, or choose files.</p>
        <input
          ref={input}
          id="scan-files"
          type="file"
          multiple
          accept=".pdf,.jpg,.jpeg,.png,application/pdf,image/jpeg,image/png"
          className="sr-only"
          onChange={(e) => {
            if (e.target.files?.length) void start(e.target.files);
            e.target.value = '';
          }}
        />
        <label htmlFor="scan-files" className="sr-only">
          Choose scan files
        </label>
        <Button variant="primary" disabled={busy} onClick={() => input.current?.click()}>
          {busy ? 'Working...' : 'Choose files'}
        </Button>
      </div>
      {message ? (
        <p role="alert" className="rounded border border-red-300 bg-red-50 p-2 text-sm text-red-900">
          {message}
        </p>
      ) : null}
      {rows.length ? (
        <ul className="max-h-72 divide-y divide-stone-200 overflow-auto rounded border border-stone-300 bg-white text-sm" aria-label="Upload progress">
          {rows.map((r) => (
            <li key={r.key} className="flex items-center gap-3 px-3 py-1.5">
              <span className="min-w-0 flex-1 truncate">{r.label}</span>
              {r.rotationConfident === false ? <span className="text-xs text-amber-800">Check rotation</span> : null}
              <span className={`text-xs ${r.state === 'failed' ? 'text-red-700' : r.state === 'ready' ? 'text-green-800' : 'text-stone-600'}`}>
                {STATE_TEXT[r.state]}
                {r.state === 'failed' && r.error ? `: ${r.error}` : ''}
              </span>
              {r.state === 'failed' ? (
                <Button size="sm" onClick={() => void retry(r)}>
                  Retry
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
