// Browser calls to the scan API routes. Client only.
import type { PageImages } from './canvas';

async function fail(res: Response): Promise<never> {
  const body = (await res.json().catch(() => ({}))) as { error?: string };
  throw new Error(body.error ?? `Request failed (${res.status}).`);
}

export async function createBatch(filename: string, pageCount: number): Promise<{ id: number }> {
  const res = await fetch('/api/batches', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename, pageCount }),
  });
  if (!res.ok) return fail(res);
  return res.json();
}

export interface UploadMeta {
  pageNumber?: number;
  sha256: string;
  width: number;
  height: number;
  rotationApplied: number;
  rotationConfident?: boolean;
}

function pageForm(img: PageImages, meta: UploadMeta): FormData {
  const form = new FormData();
  form.set('full', img.full, 'full.jpg');
  form.set('detail', img.detail, 'detail.jpg');
  form.set('meta', JSON.stringify(meta));
  return form;
}

export async function uploadPage(batchId: number, img: PageImages, meta: UploadMeta): Promise<{ id: number; status: string; duplicateOfPageId: number | null }> {
  const res = await fetch(`/api/batches/${batchId}/pages`, { method: 'POST', body: pageForm(img, meta) });
  if (!res.ok) return fail(res);
  return res.json();
}

export async function replacePageImage(pageId: number, img: PageImages, meta: UploadMeta): Promise<void> {
  const res = await fetch(`/api/pages/${pageId}/image`, { method: 'PUT', body: pageForm(img, meta) });
  if (!res.ok) return fail(res);
}

export async function extractPageRequest(pageId: number): Promise<{ status: string; error: string | null }> {
  const res = await fetch(`/api/pages/${pageId}/extract`, { method: 'POST' });
  if (!res.ok) return fail(res);
  return res.json();
}

export async function postAction(path: string, body?: unknown): Promise<void> {
  const res = await fetch(path, {
    method: 'POST',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (!res.ok) return fail(res);
}
