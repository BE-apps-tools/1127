import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import type { Db } from '@/server/db/types';
import { authenticate } from '@/server/services/users';
import { KIT_DIR, SEED_ADMIN, memoryStorage, seededDb, type MemoryStorage } from '../helpers/db';
import { seedDatabase } from '@/server/services/seed';

const stats = JSON.parse(fs.readFileSync(path.join(KIT_DIR, 'seed/seed_stats.json'), 'utf8'));

let db: Db;
let storage: MemoryStorage;

async function one<T = Record<string, unknown>>(sql: string, params: unknown[] = []): Promise<T> {
  const rows = await db.query<T>(sql, params);
  return rows[0];
}
const n = async (sql: string, params: unknown[] = []) => (await one<{ n: number }>(sql, params)).n;

beforeAll(async () => {
  storage = memoryStorage();
  db = await seededDb(storage);
});

describe('seed', () => {
  it('loads the page, requisition and line counts from seed_stats.json', async () => {
    expect(await n(`select count(*)::integer as n from scan_pages`)).toBe(stats.pages);
    expect(await n(`select count(*)::integer as n from scan_pages where status = 'duplicate'`)).toBe(stats.duplicate_pages);
    expect(await n(`select count(*)::integer as n from requisitions`)).toBe(stats.requisitions);
    expect(await n(`select count(*)::integer as n from requisition_lines`)).toBe(stats.lines);
    expect(await n(`select count(*)::integer as n from requisition_lines where sis_initialed`)).toBe(stats.lines_initialed);
    expect(await n(`select count(*)::integer as n from requisition_lines where not sis_initialed`)).toBe(stats.lines_not_initialed);
    expect(await n(`select count(*)::integer as n from requisition_lines where qty_requested is null`)).toBe(stats.lines_qty_null);
    expect(await n(`select count(*)::integer as n from requisition_lines where part_id is null`)).toBe(stats.lines_part_unresolved);
    expect(await n(`select count(*)::integer as n from requisition_lines where is_write_in`)).toBe(10);
  });

  it('matches the grand totals and distinct fingerprints', async () => {
    expect(await n(`select sum(qty_requested)::integer as n from requisition_lines`)).toBe(1036394);
    expect(await n(`select sum(qty_issued)::integer as n from requisition_lines`)).toBe(910895);
    expect(stats.grand_qty_requested).toBe(1036394);
    expect(stats.grand_qty_issued).toBe(910895);
    expect(await n(`select count(distinct fingerprint)::integer as n from requisitions`)).toBe(140);
  });

  it('counts requisitions with a non-high confidence anywhere and parts needing review', async () => {
    expect(
      await n(
        `select count(*)::integer as n from requisitions r
         where r.confidence <> 'high' or exists (select 1 from requisition_lines l where l.requisition_id = r.id and l.confidence <> 'high')`,
      ),
    ).toBe(stats.requisitions_needing_review);
    expect(stats.requisitions_needing_review).toBe(38);
    expect(await n(`select count(*)::integer as n from parts where needs_review`)).toBe(5);
  });

  it('numbers requisitions in page order', async () => {
    expect((await one<{ req_number: string }>(`select req_number from requisitions order by id limit 1`)).req_number).toBe('MFR-000001');
    expect((await one<{ req_number: string }>(`select req_number from requisitions order by id desc limit 1`)).req_number).toBe('MFR-000140');
    const a037 = await one<{ req_number: string }>(
      `select r.req_number from scan_pages p join requisitions r on r.id = p.requisition_id where p.page_key = 'A-037'`,
    );
    expect(a037.req_number).toBe('MFR-000037');
    const b001 = await one<{ req_number: string }>(
      `select r.req_number from scan_pages p join requisitions r on r.id = p.requisition_id where p.page_key = 'B-001'`,
    );
    expect(b001.req_number).toBe('MFR-000135');
    const b006 = await one<{ req_number: string }>(
      `select r.req_number from scan_pages p join requisitions r on r.id = p.requisition_id where p.page_key = 'B-006'`,
    );
    expect(b006.req_number).toBe('MFR-000140');
  });

  it('links duplicate page A-041 to A-037 and its requisition', async () => {
    const row = await one<{ status: string; orig_key: string; req_number: string }>(
      `select d.status, o.page_key as orig_key, r.req_number
       from scan_pages d join scan_pages o on o.id = d.duplicate_of_page_id join requisitions r on r.id = d.requisition_id
       where d.page_key = 'A-041'`,
    );
    expect(row).toEqual({ status: 'duplicate', orig_key: 'A-037', req_number: 'MFR-000037' });
  });

  it('MFR-000061 (page A-065) has 8 lines, the last unresolved', async () => {
    const lines = await db.query<{ part_id: number | null }>(
      `select l.part_id from requisition_lines l join requisitions r on r.id = l.requisition_id where r.req_number = 'MFR-000061' order by l.line_no`,
    );
    expect(lines).toHaveLength(8);
    expect(lines[7].part_id).toBeNull();
    const page = await one<{ page_key: string }>(`select p.page_key from requisitions r join scan_pages p on p.id = r.scan_page_id where r.req_number = 'MFR-000061'`);
    expect(page.page_key).toBe('A-065');
  });

  it('leaves every requisition unverified with source seed', async () => {
    expect(await n(`select count(*)::integer as n from requisitions where verified_at is not null`)).toBe(0);
    expect(await n(`select count(*)::integer as n from requisitions where source <> 'seed'`)).toBe(0);
    expect(await n(`select count(*)::integer as n from requisitions where status <> 'posted'`)).toBe(0);
  });

  it('stores 148 page images under seed/ and attaches the page images', async () => {
    const keys = [...storage.map.keys()].filter((k) => k.startsWith('seed/'));
    expect(keys).toHaveLength(148);
    expect(storage.map.get('seed/B-001.jpg')!.contentType).toBe('image/jpeg');
    const p = await one<{ image_path: string; extraction_model: string; width: number; height: number }>(
      `select image_path, extraction_model, width, height from scan_pages where page_key = 'B-001'`,
    );
    expect(p).toEqual({ image_path: 'seed/B-001.jpg', extraction_model: 'manual-transcription', width: 1600, height: 1236 });
  });

  it('loads master data in file order', async () => {
    expect(await n(`select count(*)::integer as n from parts`)).toBe(22);
    expect(await n(`select count(*)::integer as n from crews`)).toBe(7);
    expect(await n(`select count(*)::integer as n from people`)).toBe(7);
    expect(await n(`select count(*)::integer as n from part_aliases`)).toBe(4);
    const crews = await db.query<{ code: string; sort_order: number }>(`select code, sort_order from crews order by sort_order`);
    expect(crews.map((c) => c.sort_order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    const label = await one<{ value: string }>(`select value from app_settings where key = 'project_label'`);
    expect(label.value).toBe('Site');
    expect(await n(`select count(*)::integer as n from audit_log where action = 'seed.run'`)).toBe(1);
  });

  it('seeding twice changes nothing', async () => {
    const before = await n(`select (select count(*) from requisitions) + (select count(*) from scan_pages) + (select count(*) from audit_log) as n`);
    const res = await seedDatabase(db, storage, KIT_DIR, SEED_ADMIN);
    expect(res.seeded).toBe(false);
    const after = await n(`select (select count(*) from requisitions) + (select count(*) from scan_pages) + (select count(*) from audit_log) as n`);
    expect(after).toBe(before);
  });

  it('the admin user can sign in with the password passed in', async () => {
    const res = await authenticate(db, SEED_ADMIN.email, SEED_ADMIN.password);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.user.role).toBe('admin');
  });
});
