import type { Db } from '../db/types';
import type { Storage } from '../storage/types';
import type { AiExtractor } from '../ai/types';
import { buildSystemPrompt } from '../ai/prompt';
import { AppError } from '../errors';
import { ExtractionResultSchema, type ExtractionResult } from '@/domain/extraction';
import { normalizeExtraction, type Draft, type Lookups } from '@/domain/normalize';
import { parsePb } from '@/domain/parse';
import { fingerprint } from '@/domain/rules';
import { audit } from './audit';
import { findDuplicates, type DuplicateRef } from './requisitions';

export type PageStatus = 'uploaded' | 'extracting' | 'needs_review' | 'posted' | 'duplicate' | 'rejected' | 'failed';
export const PAGE_STATUSES: PageStatus[] = ['uploaded', 'extracting', 'needs_review', 'posted', 'duplicate', 'rejected', 'failed'];

export interface PageInfo {
  id: number;
  batchId: number;
  filename: string;
  pageNumber: number;
  pageKey: string | null;
  imagePath: string;
  status: PageStatus;
  extraction: unknown;
  extractionModel: string | null;
  extractionError: string | null;
  requisitionId: number | null;
  reqNumber: string | null;
  duplicateOfPageId: number | null;
  width: number | null;
  height: number | null;
  rotationApplied: number;
}

export interface PageImageInput {
  full: Uint8Array;
  detail: Uint8Array | null;
  sha256: string;
  width: number;
  height: number;
  rotationApplied: number;
}

const PAGE_SELECT = `
  select p.id, p.batch_id as "batchId", b.filename, p.page_number as "pageNumber", p.page_key as "pageKey",
         p.image_path as "imagePath", p.status, p.extraction, p.extraction_model as "extractionModel",
         p.extraction_error as "extractionError", p.requisition_id as "requisitionId", r.req_number as "reqNumber",
         p.duplicate_of_page_id as "duplicateOfPageId", p.width, p.height, p.rotation_applied as "rotationApplied"
  from scan_pages p
  join scan_batches b on b.id = p.batch_id
  left join requisitions r on r.id = p.requisition_id`;

async function loadPage(db: Db, pageId: number): Promise<PageInfo> {
  const [p] = await db.query<PageInfo>(`${PAGE_SELECT} where p.id = $1`, [pageId]);
  if (!p) throw new AppError('not_found', 'Page not found.');
  return p;
}

const fullKey = (batchId: number, pageNumber: number) => `scans/${batchId}/${pageNumber}.jpg`;
const detailKey = (imagePath: string) => imagePath.replace(/\.jpg$/, '.detail.jpg');

export async function createBatch(db: Db, b: { filename: string; pageCount: number; userId: number }): Promise<{ id: number }> {
  const [row] = await db.query<{ id: number }>(
    `insert into scan_batches(filename, page_count, source, uploaded_by) values ($1, $2, 'upload', $3) returning id`,
    [b.filename, b.pageCount, b.userId],
  );
  return row;
}

export async function addPage(
  db: Db,
  storage: Storage,
  input: PageImageInput & { batchId: number; pageNumber: number; rotationConfident: boolean },
): Promise<{ id: number; status: PageStatus; duplicateOfPageId: number | null }> {
  const [batch] = await db.query<{ uploaded_by: number | null }>(`select uploaded_by from scan_batches where id = $1`, [input.batchId]);
  if (!batch) throw new AppError('not_found', 'Batch not found.');

  const key = fullKey(input.batchId, input.pageNumber);
  await storage.put(key, input.full, 'image/jpeg');
  if (input.detail) await storage.put(detailKey(key), input.detail, 'image/jpeg');

  const [earlier] = await db.query<{ id: number }>(
    `select id from scan_pages where image_sha256 = $1 order by id limit 1`,
    [input.sha256],
  );
  const status: PageStatus = earlier ? 'duplicate' : 'uploaded';
  const [row] = await db.query<{ id: number }>(
    `insert into scan_pages(batch_id, page_number, image_path, image_sha256, width, height, rotation_applied, status, duplicate_of_page_id)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [input.batchId, input.pageNumber, key, input.sha256, input.width, input.height, input.rotationApplied, status, earlier?.id ?? null],
  );
  await audit(db, {
    userId: batch.uploaded_by,
    action: 'page.upload',
    entity: 'scan_page',
    entityId: row.id,
    detail: { batchId: input.batchId, pageNumber: input.pageNumber, rotationConfident: input.rotationConfident, status },
  });
  return { id: row.id, status, duplicateOfPageId: earlier?.id ?? null };
}

/** Replaces the images of a page that has not been posted, clears the reading, and puts it back to `uploaded`. */
export async function replacePageImage(db: Db, storage: Storage, pageId: number, input: PageImageInput): Promise<void> {
  const page = await loadPage(db, pageId);
  if (!['uploaded', 'needs_review', 'failed'].includes(page.status)) {
    throw new AppError('conflict', `A page that is ${page.status} cannot be rotated.`);
  }
  await storage.put(page.imagePath, input.full, 'image/jpeg');
  if (input.detail) await storage.put(detailKey(page.imagePath), input.detail, 'image/jpeg');
  else await storage.remove(detailKey(page.imagePath));
  await db.query(
    `update scan_pages set image_sha256 = $2, width = $3, height = $4, rotation_applied = ((rotation_applied + $5) % 360),
            status = 'uploaded', extraction = null, extraction_model = null, extraction_error = null, extracted_at = null
     where id = $1`,
    [pageId, input.sha256, input.width, input.height, input.rotationApplied],
  );
}

export async function extractPage(
  db: Db,
  storage: Storage,
  ai: AiExtractor,
  pageId: number,
  lookups: Lookups,
): Promise<{ status: PageStatus; error: string | null }> {
  const claimed = await db.query<{ image_path: string }>(
    `update scan_pages set status = 'extracting' where id = $1 and status in ('uploaded', 'failed') returning image_path`,
    [pageId],
  );
  if (!claimed.length) {
    const page = await loadPage(db, pageId);
    throw new AppError('conflict', `A page that is ${page.status} cannot be read.`);
  }
  const imagePath = claimed[0].image_path;

  if (!ai.enabled) {
    await db.query(
      `update scan_pages set status = 'needs_review', extraction = null, extraction_model = null, extraction_error = null where id = $1`,
      [pageId],
    );
    return { status: 'needs_review', error: null };
  }

  try {
    const full = await storage.get(imagePath);
    if (!full) throw new Error('The page image was not found in storage.');
    const detail = await storage.get(detailKey(imagePath));
    const result = await ai.extract({ system: buildSystemPrompt(lookups), full: full.bytes, detail: detail?.bytes ?? null });
    await db.query(
      `update scan_pages set status = 'needs_review', extraction = $2::jsonb, extraction_model = $3, extraction_error = null, extracted_at = now()
       where id = $1`,
      [pageId, JSON.stringify(result), ai.modelId],
    );
    return { status: 'needs_review', error: null };
  } catch (err) {
    const message = (err instanceof Error ? err.message : 'Reading failed.').slice(0, 500);
    await db.query(`update scan_pages set status = 'failed', extraction_error = $2 where id = $1`, [pageId, message]);
    return { status: 'failed', error: message };
  }
}

export interface DraftResult {
  page: PageInfo;
  draft: Draft;
  duplicates: DuplicateRef[];
}

const EMPTY_DRAFT: Draft = {
  form: {
    crewId: null,
    requesterId: null,
    requesterNameRaw: null,
    pbLocationRaw: '',
    requestDate: null,
    requestDateRaw: null,
    approverId: null,
    approvalSignaturePresent: null,
    notes: null,
    confidence: 'high',
    flags: [],
  },
  lines: [],
  warnings: [],
};

export async function getDraft(db: Db, pageId: number, lookups: Lookups, today: string): Promise<DraftResult> {
  const page = await loadPage(db, pageId);
  if (page.status !== 'needs_review') throw new AppError('conflict', 'This page is not waiting for review.');

  let draft: Draft = structuredClone(EMPTY_DRAFT);
  if (page.extraction) {
    const parsed = ExtractionResultSchema.safeParse(page.extraction);
    if (parsed.success) draft = normalizeExtraction(parsed.data as ExtractionResult, lookups, today);
  }

  let duplicates: DuplicateRef[] = [];
  const crew = lookups.crews.find((c) => c.id === draft.form.crewId);
  if (crew && draft.form.pbLocationRaw.trim() && draft.form.requestDate) {
    const partNumberOf = (id: number | null) => (id == null ? null : (lookups.parts.find((p) => p.id === id)?.partNumber ?? null));
    const fp = fingerprint({
      crewCode: crew.code,
      pbLocation: parsePb(draft.form.pbLocationRaw).pbLocation,
      requestDate: draft.form.requestDate,
      lines: draft.lines.map((l) => ({
        partNumber: partNumberOf(l.partId),
        partNumberRaw: l.partNumberRaw,
        qtyEach: l.qtyRequested,
        qtyRaw: l.qtyRaw,
      })),
    });
    duplicates = await findDuplicates(db, fp);
  }
  return { page, draft, duplicates };
}

async function requireStatus(db: Db, pageId: number, allowed: PageStatus[], what: string): Promise<PageInfo> {
  const page = await loadPage(db, pageId);
  if (!allowed.includes(page.status)) throw new AppError('conflict', `A page that is ${page.status} cannot be ${what}.`);
  return page;
}

export async function rejectPage(db: Db, pageId: number, userId: number, reason?: string): Promise<void> {
  await requireStatus(db, pageId, ['uploaded', 'needs_review', 'failed'], 'rejected');
  await db.query(`update scan_pages set status = 'rejected' where id = $1`, [pageId]);
  await audit(db, { userId, action: 'page.reject', entity: 'scan_page', entityId: pageId, detail: { reason: reason ?? null } });
}

export async function markPageDuplicate(db: Db, pageId: number, requisitionId: number, userId: number): Promise<void> {
  await requireStatus(db, pageId, ['needs_review'], 'marked as a duplicate');
  const [req] = await db.query<{ scan_page_id: number | null }>(`select scan_page_id from requisitions where id = $1`, [requisitionId]);
  if (!req) throw new AppError('not_found', 'Requisition not found.');
  await db.query(
    `update scan_pages set status = 'duplicate', requisition_id = $2, duplicate_of_page_id = $3 where id = $1`,
    [pageId, requisitionId, req.scan_page_id],
  );
  await audit(db, { userId, action: 'page.duplicate', entity: 'scan_page', entityId: pageId, detail: { requisitionId } });
}

export async function reopenPage(db: Db, pageId: number, userId: number): Promise<void> {
  await requireStatus(db, pageId, ['rejected', 'duplicate', 'failed'], 'reopened');
  await db.query(
    `update scan_pages set status = 'uploaded', requisition_id = null, duplicate_of_page_id = null, extraction_error = null where id = $1`,
    [pageId],
  );
  await audit(db, { userId, action: 'page.reopen', entity: 'scan_page', entityId: pageId });
}

export async function listPages(
  db: Db,
  opts: { status?: PageStatus | PageStatus[]; batchId?: number; limit: number; offset: number },
): Promise<PageInfo[]> {
  const statuses = opts.status === undefined ? null : Array.isArray(opts.status) ? opts.status : [opts.status];
  return db.query<PageInfo>(
    `${PAGE_SELECT}
     where ($1::text[] is null or p.status = any($1::text[])) and ($2::integer is null or p.batch_id = $2)
     order by p.batch_id, p.page_number
     limit $3 offset $4`,
    [statuses, opts.batchId ?? null, opts.limit, opts.offset],
  );
}

export async function countPagesByStatus(db: Db): Promise<Record<PageStatus, number>> {
  const rows = await db.query<{ status: PageStatus; n: number }>(`select status, count(*)::integer as n from scan_pages group by status`);
  const out = Object.fromEntries(PAGE_STATUSES.map((s) => [s, 0])) as Record<PageStatus, number>;
  for (const r of rows) out[r.status] = r.n;
  return out;
}

/** Next `needs_review` page in batch then page order, after the given page when one is passed. */
export async function nextPageToVerify(db: Db, afterPageId?: number): Promise<number | null> {
  const rows = await db.query<{ id: number }>(
    `select p.id from scan_pages p
     where p.status = 'needs_review'
       and ($1::integer is null or (p.batch_id, p.page_number) > (select batch_id, page_number from scan_pages where id = $1))
     order by p.batch_id, p.page_number limit 1`,
    [afterPageId ?? null],
  );
  return rows[0]?.id ?? null;
}

/** Position of a page in the to-verify queue (1-based) and the queue length. Position is 0 when the page is not in the queue. */
export async function getQueuePosition(db: Db, pageId: number): Promise<{ position: number; total: number }> {
  const [r] = await db.query<{ position: number; total: number }>(
    `select
       (select count(*) from scan_pages q, scan_pages me
         where me.id = $1 and q.status = 'needs_review' and me.status = 'needs_review'
           and (q.batch_id, q.page_number) <= (me.batch_id, me.page_number))::integer as position,
       (select count(*) from scan_pages where status = 'needs_review')::integer as total`,
    [pageId],
  );
  return r;
}

export async function getPageImage(
  db: Db,
  storage: Storage,
  pageId: number,
  variant: 'full' | 'detail',
): Promise<{ bytes: Uint8Array; contentType: string } | null> {
  const [row] = await db.query<{ image_path: string }>(`select image_path from scan_pages where id = $1`, [pageId]);
  if (!row) throw new AppError('not_found', 'Page not found.');
  return storage.get(variant === 'full' ? row.image_path : detailKey(row.image_path));
}

export { loadPage as getPage };
