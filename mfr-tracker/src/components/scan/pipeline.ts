// The upload queue. Written against injected functions so it can be tested without a browser.

export interface PageTask {
  key: string;
  label: string;
  pageNumber: number;
}

export type PageState = 'rendering' | 'uploading' | 'reading' | 'ready' | 'duplicate' | 'failed';

export interface PageProgress<T extends PageTask = PageTask> {
  task: T;
  state: PageState;
  pageId?: number;
  error?: string;
  /** false when the page was rotated without a confident reading of the blue band. */
  rotationConfident?: boolean;
}

export interface PipelineDeps<T extends PageTask, R> {
  render(task: T): Promise<R>;
  upload(task: T, rendered: R): Promise<{ id: number; status: string; duplicateOfPageId: number | null }>;
  extract(pageId: number, task: T): Promise<{ status: string; error: string | null }>;
}

export const MAX_IN_FLIGHT = 3;

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong.');

/** Runs one page through render, upload and read. Never throws; failures come back as a `failed` state. */
export async function processPage<T extends PageTask, R>(
  task: T,
  deps: PipelineDeps<T, R>,
  onProgress: (p: PageProgress<T>) => void,
): Promise<PageProgress<T>> {
  const emit = (p: Omit<PageProgress<T>, 'task'>): PageProgress<T> => {
    const full = { task, ...p };
    onProgress(full);
    return full;
  };
  let pageId: number | undefined;
  try {
    emit({ state: 'rendering' });
    const rendered = await deps.render(task);
    emit({ state: 'uploading' });
    const up = await deps.upload(task, rendered);
    pageId = up.id;
    if (up.status === 'duplicate') return emit({ state: 'duplicate', pageId });
    emit({ state: 'reading', pageId });
    const res = await deps.extract(pageId, task);
    if (res.status === 'failed') return emit({ state: 'failed', pageId, error: res.error ?? 'Reading failed.' });
    return emit({ state: 'ready', pageId });
  } catch (err) {
    return emit({ state: 'failed', pageId, error: message(err) });
  }
}

/** Processes tasks with at most `concurrency` pages in flight. Resolves with the final state of every task, in order. */
export async function runPipeline<T extends PageTask, R>(
  tasks: T[],
  deps: PipelineDeps<T, R>,
  opts: { concurrency?: number; onProgress: (p: PageProgress<T>) => void },
): Promise<PageProgress<T>[]> {
  const results: PageProgress<T>[] = new Array(tasks.length);
  let next = 0;
  const worker = async () => {
    while (next < tasks.length) {
      const i = next++;
      results[i] = await processPage(tasks[i], deps, opts.onProgress);
    }
  };
  const n = Math.max(1, Math.min(opts.concurrency ?? MAX_IN_FLIGHT, tasks.length));
  await Promise.all(Array.from({ length: n }, worker));
  return results;
}
