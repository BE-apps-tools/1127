import { describe, it, expect, beforeAll } from 'vitest';
import type { Db } from '@/server/db/types';
import type { AiExtractor } from '@/server/ai/types';
import type { Lookups } from '@/domain/normalize';
import { createMockExtractor } from '@/server/ai/mock';
import { createOffExtractor } from '@/server/ai/off';
import { getLookups } from '@/server/services/lookups';
import {
  addPage,
  countPagesByStatus,
  createBatch,
  extractPage,
  getDraft,
  getPageImage,
  listPages,
  markPageDuplicate,
  nextPageToVerify,
  rejectPage,
  reopenPage,
  replacePageImage,
} from '@/server/services/scans';
import { memoryStorage, seededDb, type MemoryStorage } from '../helpers/db';

const TODAY = '2026-11-12';
let db: Db;
let storage: MemoryStorage;
let lookups: Lookups;
let userId: number;
let counter = 0;

const bytes = (...n: number[]) => new Uint8Array([0xff, 0xd8, 0xff, ...n]);
const meta = (sha: string) => ({ sha256: sha, width: 1600, height: 1236, rotationApplied: 0, rotationConfident: true });

async function newBatch(pages: number) {
  return createBatch(db, { filename: `test-${++counter}.pdf`, pageCount: pages, userId });
}
async function newPage(batchId: number, pageNumber: number, sha = `sha-${++counter}`, detail: Uint8Array | null = bytes(9)) {
  return addPage(db, storage, { batchId, pageNumber, full: bytes(pageNumber), detail, ...meta(sha) });
}

beforeAll(async () => {
  storage = memoryStorage();
  db = await seededDb(storage);
  lookups = await getLookups(db);
  userId = (await db.query<{ id: number }>(`select id from app_users limit 1`))[0].id;
});

describe('scans service', () => {
  it('addPage stores both images and returns uploaded', async () => {
    const b = await newBatch(1);
    const p = await newPage(b.id, 1);
    expect(p.status).toBe('uploaded');
    expect(p.duplicateOfPageId).toBeNull();
    expect(storage.map.has(`scans/${b.id}/1.jpg`)).toBe(true);
    expect(storage.map.has(`scans/${b.id}/1.detail.jpg`)).toBe(true);
  });

  it('a second page with the same sha256 is stored as a duplicate of the first and is not read', async () => {
    const b = await newBatch(2);
    const first = await newPage(b.id, 1, 'same-sha');
    const second = await newPage(b.id, 2, 'same-sha');
    expect(second.status).toBe('duplicate');
    expect(second.duplicateOfPageId).toBe(first.id);
    await expect(extractPage(db, storage, createMockExtractor(), second.id, lookups)).rejects.toThrow();
  });

  it('extractPage with the mock ends needs_review with the fixture stored', async () => {
    const b = await newBatch(1);
    const p = await newPage(b.id, 1);
    const res = await extractPage(db, storage, createMockExtractor(), p.id, lookups);
    expect(res).toEqual({ status: 'needs_review', error: null });
    const [row] = await db.query<{ extraction: { form: { crew_code: string } }; extraction_model: string }>(
      `select extraction, extraction_model from scan_pages where id = $1`,
      [p.id],
    );
    expect(row.extraction_model).toBe('mock');
    expect(row.extraction.form.crew_code).toBe('STAGE_PREP');
  });

  it('extractPage with AI off ends needs_review with no extraction', async () => {
    const b = await newBatch(1);
    const p = await newPage(b.id, 1);
    const res = await extractPage(db, storage, createOffExtractor(), p.id, lookups);
    expect(res.status).toBe('needs_review');
    const [row] = await db.query<{ extraction: unknown }>(`select extraction from scan_pages where id = $1`, [p.id]);
    expect(row.extraction).toBeNull();
    const { draft } = await getDraft(db, p.id, lookups, TODAY);
    expect(draft.lines).toEqual([]);
    expect(draft.form.crewId).toBeNull();
    expect(draft.form.requestDate).toBeNull();
  });

  it('an AI that throws leaves the page failed with the message, and a later call succeeds', async () => {
    const b = await newBatch(1);
    const p = await newPage(b.id, 1);
    const broken: AiExtractor = {
      enabled: true,
      modelId: 'broken',
      extract: async () => {
        throw new Error('model exploded');
      },
    };
    const res = await extractPage(db, storage, broken, p.id, lookups);
    expect(res.status).toBe('failed');
    expect(res.error).toContain('model exploded');
    const [row] = await db.query<{ status: string; extraction_error: string }>(`select status, extraction_error from scan_pages where id = $1`, [p.id]);
    expect(row).toEqual({ status: 'failed', extraction_error: 'model exploded' });
    const again = await extractPage(db, storage, createMockExtractor(), p.id, lookups);
    expect(again).toEqual({ status: 'needs_review', error: null });
    const [after] = await db.query<{ extraction_error: string | null }>(`select extraction_error from scan_pages where id = $1`, [p.id]);
    expect(after.extraction_error).toBeNull();
  });

  it('getDraft returns the normalized draft and the existing requisition as a duplicate', async () => {
    const b = await newBatch(1);
    const p = await newPage(b.id, 1);
    await extractPage(db, storage, createMockExtractor(), p.id, lookups);
    const { draft, duplicates, page } = await getDraft(db, p.id, lookups, TODAY);
    expect(page.id).toBe(p.id);
    expect(draft.form.pbLocationRaw).toBe('103');
    expect(draft.form.requestDate).toBe('2026-11-02');
    expect(draft.lines.map((l) => l.qtyRequested)).toEqual([596, 149]);
    expect(duplicates.map((d) => d.reqNumber)).toEqual(['MFR-000135']);
  });

  it('reject, duplicate and reopen move statuses and refuse other statuses', async () => {
    const b = await newBatch(3);
    const p1 = await newPage(b.id, 1);
    const p2 = await newPage(b.id, 2);
    await extractPage(db, storage, createMockExtractor(), p1.id, lookups);
    await extractPage(db, storage, createMockExtractor(), p2.id, lookups);

    await rejectPage(db, p1.id, userId, 'blurry');
    expect((await listPages(db, { status: 'rejected', batchId: b.id, limit: 10, offset: 0 })).map((p) => p.id)).toEqual([p1.id]);
    await expect(rejectPage(db, p1.id, userId)).rejects.toThrow();

    const [{ id: reqId }] = await db.query<{ id: number }>(`select id from requisitions where req_number = 'MFR-000135'`);
    await markPageDuplicate(db, p2.id, reqId, userId);
    const [dup] = await db.query<{ status: string; requisition_id: number }>(`select status, requisition_id from scan_pages where id = $1`, [p2.id]);
    expect(dup).toEqual({ status: 'duplicate', requisition_id: reqId });
    await expect(markPageDuplicate(db, p2.id, reqId, userId)).rejects.toThrow();

    await reopenPage(db, p1.id, userId);
    await reopenPage(db, p2.id, userId);
    const rows = await db.query<{ status: string; requisition_id: number | null }>(`select status, requisition_id from scan_pages where id in ($1, $2) order by id`, [p1.id, p2.id]);
    expect(rows).toEqual([
      { status: 'uploaded', requisition_id: null },
      { status: 'uploaded', requisition_id: null },
    ]);
    await expect(reopenPage(db, p1.id, userId)).rejects.toThrow();
  });

  it('nextPageToVerify follows batch then page order', async () => {
    const b = await newBatch(3);
    const ids: number[] = [];
    for (const n of [1, 2, 3]) {
      const p = await newPage(b.id, n);
      await extractPage(db, storage, createMockExtractor(), p.id, lookups);
      ids.push(p.id);
    }
    expect(await nextPageToVerify(db, ids[0])).toBe(ids[1]);
    expect(await nextPageToVerify(db, ids[1])).toBe(ids[2]);
    expect(await nextPageToVerify(db, ids[2])).toBeNull();
    const first = await nextPageToVerify(db);
    expect(first).not.toBeNull();
    const counts = await countPagesByStatus(db);
    expect(counts.needs_review).toBeGreaterThanOrEqual(3);
    expect(counts.posted).toBe(140);
    expect(counts.duplicate).toBeGreaterThanOrEqual(8);
  });

  it('getPageImage returns stored bytes for full and detail, null for a missing detail', async () => {
    const b = await newBatch(2);
    const withDetail = await newPage(b.id, 1, undefined, bytes(7));
    const noDetail = await newPage(b.id, 2, undefined, null);
    const full = await getPageImage(db, storage, withDetail.id, 'full');
    expect(Array.from(full!.bytes)).toEqual(Array.from(bytes(1)));
    expect(full!.contentType).toBe('image/jpeg');
    const detail = await getPageImage(db, storage, withDetail.id, 'detail');
    expect(Array.from(detail!.bytes)).toEqual(Array.from(bytes(7)));
    expect(await getPageImage(db, storage, noDetail.id, 'detail')).toBeNull();
  });

  it('replacePageImage swaps the images, adds the rotation, clears the reading and resets to uploaded', async () => {
    const b = await newBatch(1);
    const p = await newPage(b.id, 1);
    await extractPage(db, storage, createMockExtractor(), p.id, lookups);
    await replacePageImage(db, storage, p.id, { full: bytes(42), detail: bytes(43), sha256: 'rotated-sha', width: 1236, height: 1600, rotationApplied: 90 });
    const [row] = await db.query<{ status: string; extraction: unknown; rotation_applied: number; image_sha256: string }>(
      `select status, extraction, rotation_applied, image_sha256 from scan_pages where id = $1`,
      [p.id],
    );
    expect(row).toEqual({ status: 'uploaded', extraction: null, rotation_applied: 90, image_sha256: 'rotated-sha' });
    const full = await getPageImage(db, storage, p.id, 'full');
    expect(Array.from(full!.bytes)).toEqual(Array.from(bytes(42)));
  });
});
