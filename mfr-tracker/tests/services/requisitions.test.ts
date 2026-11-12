import { describe, it, expect } from 'vitest';
import type { Db } from '@/server/db/types';
import type { RequisitionInput, RequisitionLineInput } from '@/domain/requisition-input';
import { createMockExtractor } from '@/server/ai/mock';
import { getLookups } from '@/server/services/lookups';
import { addPage, createBatch, extractPage } from '@/server/services/scans';
import {
  getRequisition,
  markLinesIssued,
  saveRequisition,
  updateRequisition,
  verifyRequisition,
  voidRequisition,
} from '@/server/services/requisitions';
import { memoryStorage, seededDb } from '../helpers/db';

async function ids(db: Db) {
  const crews = await db.query<{ id: number; code: string }>(`select id, code from crews`);
  const parts = await db.query<{ id: number; part_number: string }>(`select id, part_number from parts`);
  const [user] = await db.query<{ id: number }>(`select id from app_users limit 1`);
  return {
    crew: (code: string) => crews.find((c) => c.code === code)!.id,
    part: (pn: string) => parts.find((p) => p.part_number === pn)!.id,
    userId: user.id,
  };
}

const line = (over: Partial<RequisitionLineInput>): RequisitionLineInput => ({
  partId: null,
  partNumberRaw: null,
  descriptionRaw: null,
  isWriteIn: false,
  qtyRaw: null,
  qtyRequested: null,
  packQty: null,
  packUnit: null,
  unitWord: null,
  dateRequired: null,
  sisInitialed: false,
  confidence: 'high',
  flags: [],
  note: null,
  ...over,
});

const input = (crewId: number, lines: RequisitionLineInput[], over: Partial<RequisitionInput> = {}): RequisitionInput => ({
  crewId,
  requesterId: null,
  requesterNameRaw: null,
  pbLocationRaw: '110',
  requestDate: '2026-11-10',
  approverId: null,
  approvalSignaturePresent: null,
  notes: null,
  confidence: 'high',
  flags: [],
  lines,
  duplicateAcknowledged: false,
  ...over,
});

describe('requisitions service', () => {
  it('saves a manual requisition with the next number, verified, issue rule applied', async () => {
    const db = await seededDb();
    const k = await ids(db);
    const res = await saveRequisition(
      db,
      input(k.crew('TUBES'), [
        line({ partId: k.part('25244-000'), partNumberRaw: '25244-000', qtyRaw: '2 Pallets', qtyRequested: 7680, packQty: 2, packUnit: 'pallet', sisInitialed: true }),
      ]),
      { userId: k.userId, source: 'manual' },
    );
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.reqNumber).toBe('MFR-000141');
    const detail = await getRequisition(db, res.id);
    expect(detail!.verifiedAt).not.toBeNull();
    expect(detail!.pbNumber).toBe(110);
    expect(detail!.source).toBe('manual');
    expect(detail!.lines[0].qtyIssued).toBe(7680);
    expect(detail!.auditEntries.map((a) => a.action)).toContain('requisition.create');
  });

  it('returns duplicates and writes nothing unless acknowledged', async () => {
    const db = await seededDb();
    const k = await ids(db);
    const dup = input(
      k.crew('STAGE_PREP'),
      [
        line({ partId: k.part('25056-001'), partNumberRaw: '25056-001', qtyRaw: '596 bolts', qtyRequested: 596, sisInitialed: true }),
        line({ partId: k.part('20-0070-07'), partNumberRaw: '20-0070-07', qtyRaw: '149 brackets', qtyRequested: 149, sisInitialed: true }),
      ],
      { pbLocationRaw: '103', requestDate: '2026-11-02' },
    );
    const first = await saveRequisition(db, dup, { userId: k.userId, source: 'manual' });
    expect(first.ok).toBe(false);
    if (!first.ok) expect(first.duplicates.map((d) => d.reqNumber)).toEqual(['MFR-000135']);
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::integer as n from requisitions`);
    expect(n).toBe(140);

    const second = await saveRequisition(db, { ...dup, duplicateAcknowledged: true }, { userId: k.userId, source: 'manual' });
    expect(second.ok).toBe(true);
    if (second.ok) expect(second.reqNumber).toBe('MFR-000141');
  });

  it('links a needs_review scan page and refuses a page in another status', async () => {
    const storage = memoryStorage();
    const db = await seededDb(storage);
    const k = await ids(db);
    const lookups = await getLookups(db);
    const batch = await createBatch(db, { filename: 'x.pdf', pageCount: 1, userId: k.userId });
    const page = await addPage(db, storage, {
      batchId: batch.id, pageNumber: 1, full: new Uint8Array([0xff, 0xd8, 0xff]), detail: null,
      sha256: 'abc', width: 1600, height: 1236, rotationApplied: 0, rotationConfident: true,
    });
    await extractPage(db, storage, createMockExtractor(), page.id, lookups);
    const body = input(k.crew('MISC'), [line({ partNumberRaw: '15-0001', qtyRaw: '5', qtyRequested: 5 })]);
    const res = await saveRequisition(db, body, { userId: k.userId, source: 'scan', scanPageId: page.id });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    const [p] = await db.query<{ status: string; requisition_id: number }>(`select status, requisition_id from scan_pages where id = $1`, [page.id]);
    expect(p).toEqual({ status: 'posted', requisition_id: res.id });
    const detail = await getRequisition(db, res.id);
    expect(detail!.scanPageId).toBe(page.id);
    expect(detail!.source).toBe('scan');

    const [seeded] = await db.query<{ id: number }>(`select id from scan_pages where page_key = 'A-001'`);
    const other = input(k.crew('MISC'), [line({ partNumberRaw: '15-0002', qtyRaw: '6', qtyRequested: 6 })]);
    await expect(saveRequisition(db, other, { userId: k.userId, source: 'scan', scanPageId: seeded.id })).rejects.toThrow();
    const [{ n }] = await db.query<{ n: number }>(`select count(*)::integer as n from requisitions`);
    expect(n).toBe(141);
  });

  it('keeps line order as line_no', async () => {
    const db = await seededDb();
    const k = await ids(db);
    const res = await saveRequisition(
      db,
      input(k.crew('MISC'), [
        line({ partNumberRaw: 'C-3', qtyRaw: '3', qtyRequested: 3 }),
        line({ partNumberRaw: 'A-1', qtyRaw: '1', qtyRequested: 1 }),
        line({ partNumberRaw: 'B-2', qtyRaw: '2', qtyRequested: 2 }),
      ]),
      { userId: k.userId, source: 'manual' },
    );
    if (!res.ok) throw new Error('save failed');
    const detail = await getRequisition(db, res.id);
    expect(detail!.lines.map((l) => [l.lineNo, l.partNumberRaw])).toEqual([[1, 'C-3'], [2, 'A-1'], [3, 'B-2']]);
  });

  it('update recomputes issued qty and fingerprint, keeps the number, and audits before and after', async () => {
    const db = await seededDb();
    const k = await ids(db);
    const created = await saveRequisition(
      db,
      input(k.crew('TUBES'), [line({ partId: k.part('25244-000'), partNumberRaw: '25244-000', qtyRaw: '100', qtyRequested: 100, sisInitialed: true })]),
      { userId: k.userId, source: 'manual' },
    );
    if (!created.ok) throw new Error('save failed');
    const before = await db.query<{ fingerprint: string }>(`select fingerprint from requisitions where id = $1`, [created.id]);
    const res = await updateRequisition(
      db,
      created.id,
      input(k.crew('TUBES'), [line({ partId: k.part('25244-000'), partNumberRaw: '25244-000', qtyRaw: '250', qtyRequested: 250, sisInitialed: true })]),
      k.userId,
    );
    expect(res).toEqual({ ok: true });
    const detail = await getRequisition(db, created.id);
    expect(detail!.reqNumber).toBe(created.reqNumber);
    expect(detail!.lines[0].qtyIssued).toBe(250);
    const after = await db.query<{ fingerprint: string }>(`select fingerprint from requisitions where id = $1`, [created.id]);
    expect(after[0].fingerprint).not.toBe(before[0].fingerprint);
    const entry = detail!.auditEntries.find((a) => a.action === 'requisition.update')!;
    const d = entry.detail as { before: { lines: Array<{ qtyRequested: number }> }; after: { lines: Array<{ qtyRequested: number }> } };
    expect(d.before.lines[0].qtyRequested).toBe(100);
    expect(d.after.lines[0].qtyRequested).toBe(250);
  });

  it('refuses to update a void requisition', async () => {
    const db = await seededDb();
    const k = await ids(db);
    const [r] = await db.query<{ id: number; crew_id: number }>(`select id, crew_id from requisitions where req_number = 'MFR-000006'`);
    await voidRequisition(db, r.id, k.userId, 'entered twice');
    await expect(
      updateRequisition(db, r.id, input(r.crew_id, [line({ partNumberRaw: 'X', qtyRaw: '1', qtyRequested: 1 })]), k.userId),
    ).rejects.toThrow(/void/i);
  });

  it('markLinesIssued updates pending lines, sets issued_on, and skips lines with no each-count', async () => {
    const db = await seededDb();
    const k = await ids(db);
    const pending = async () =>
      (await db.query<{ n: number }>(`select count(*)::integer as n from v_tracker_lines where issue_status = 'pending'`))[0].n;
    expect(await pending()).toBe(58);
    const six = await db.query<{ id: number }>(
      `select l.id from requisition_lines l join requisitions r on r.id = l.requisition_id where r.req_number = 'MFR-000006' order by l.line_no`,
    );
    expect(six).toHaveLength(2);
    const res = await markLinesIssued(db, six.map((l) => l.id), '2026-11-11', k.userId);
    expect(res).toEqual({ updated: 2, skipped: 0 });
    expect(await pending()).toBe(56);
    const rows = await db.query<{ issued_on: string; qty_issued: number; qty_requested: number }>(
      `select issued_on, qty_issued, qty_requested from requisition_lines where id = any($1::integer[])`,
      [six.map((l) => l.id)],
    );
    for (const r of rows) {
      expect(r.issued_on).toBe('2026-11-11');
      expect(r.qty_issued).toBe(r.qty_requested);
    }

    const created = await saveRequisition(db, input(k.crew('MIBS'), [line({ partNumberRaw: '60825-300', qtyRaw: "100's" })]), { userId: k.userId, source: 'manual' });
    if (!created.ok) throw new Error('save failed');
    const [noQty] = await db.query<{ id: number }>(`select id from requisition_lines where requisition_id = $1`, [created.id]);
    expect(await markLinesIssued(db, [noQty.id, six[0].id], '2026-11-11', k.userId)).toEqual({ updated: 0, skipped: 2 });
  });

  it('verify sets verified_at; void needs a reason and drops the lines from the matrix view', async () => {
    const db = await seededDb();
    const k = await ids(db);
    const [r] = await db.query<{ id: number }>(`select id from requisitions where req_number = 'MFR-000037'`);
    expect((await getRequisition(db, r.id))!.verifiedAt).toBeNull();
    await verifyRequisition(db, r.id, k.userId);
    expect((await getRequisition(db, r.id))!.verifiedAt).not.toBeNull();

    const cells = async () => (await db.query<{ n: number }>(`select count(*)::integer as n from v_pb_part_matrix`))[0].n;
    const before = await cells();
    await expect(voidRequisition(db, r.id, k.userId, '  ')).rejects.toThrow(/reason/i);
    await voidRequisition(db, r.id, k.userId, 'scanned twice');
    expect(await cells()).toBeLessThan(before);
    const detail = await getRequisition(db, r.id);
    expect(detail!.status).toBe('void');
    expect(detail!.voidReason).toBe('scanned twice');
  });

  it('the database rejects a line that breaks the issue rule', async () => {
    const db = await seededDb();
    await expect(
      db.query(`update requisition_lines set qty_issued = 1 where id = (select min(id) from requisition_lines where not sis_initialed)`),
    ).rejects.toThrow();
  });
});
