import { describe, it, expect, beforeAll } from 'vitest';
import type { Db } from '@/server/db/types';
import { parseTrackerFilters, queryTracker, exportTracker, trackerFiltersToQuery } from '@/server/services/tracker';
import { seededDb } from '../helpers/db';

let db: Db;
beforeAll(async () => {
  db = await seededDb();
});

const run = (qs: string) => queryTracker(db, parseTrackerFilters(new URLSearchParams(qs)), { page: 1, pageSize: 100 });

describe('tracker service', () => {
  it.each([
    ['crew=MIBS', 108, 27, 468104, 399698],
    ['crew=TORQUE_ALIGN', 192, 35, 39207, 34541],
    ['from=2026-10-01&to=2026-10-31', 185, 63, 566892, 547160],
    ['pb=81-90', 71, 26, 292483, 268535],
    ['issue=pending', 58, 19, 125499, 0],
  ])('%s', async (qs, lines, reqs, requested, issued) => {
    const r = await run(qs);
    expect(r.totalLines).toBe(lines);
    expect(r.totalRequisitions).toBe(reqs);
    expect(r.sumRequested).toBe(requested);
    expect(r.sumIssued).toBe(issued);
  });

  it('pb=37 is an exact number match', async () => {
    const r = await run('pb=37');
    expect(r.totalLines).toBe(19);
    expect(r.totalRequisitions).toBe(5);
    expect(r.sumRequested).toBe(24582);
  });

  it('pb text matches pb_location case-insensitively', async () => {
    const r = await run('pb=for%20ldys');
    expect(r.totalLines).toBe(1);
    expect(r.rows[0].crewCode).toBe('MISC');
  });

  it('review returns the lines of 38 requisitions; unresolved returns 1 line', async () => {
    const r = await run('review=1');
    expect(r.totalRequisitions).toBe(38);
    expect((await run('unresolved=1')).totalLines).toBe(1);
  });

  it('q finds a requisition number', async () => {
    const r = await run('q=MFR-000135');
    expect(r.totalLines).toBe(2);
    expect(new Set(r.rows.map((x) => x.reqNumber))).toEqual(new Set(['MFR-000135']));
  });

  it('paging returns 100 rows on page 1 and 24 on page 5', async () => {
    const f = parseTrackerFilters(new URLSearchParams());
    const p1 = await queryTracker(db, f, { page: 1, pageSize: 100 });
    const p5 = await queryTracker(db, f, { page: 5, pageSize: 100 });
    expect(p1.rows).toHaveLength(100);
    expect(p5.rows).toHaveLength(24);
    expect(p1.totalLines).toBe(424);
  });

  it('default sort starts with the newest request date; other sorts are applied', async () => {
    const newest = await run('');
    expect(newest.rows[0].requestDate).toBe('2026-11-10');
    const oldest = await run('sort=date_asc');
    expect(oldest.rows[0].requestDate).toBe('2026-07-28');
    const byPb = await run('sort=pb');
    expect(byPb.rows[0].pbNumber).toBe(1);
  });

  it('filters by part and requester, and exports every row', async () => {
    const [{ id }] = await db.query<{ id: number }>(`select id from parts where part_number = '25050-001'`);
    const r = await run(`part=${id}`);
    expect(r.totalLines).toBe(29);
    expect(r.sumRequested).toBe(139868);
    expect(r.sumIssued).toBe(119560);
    const all = await exportTracker(db, parseTrackerFilters(new URLSearchParams()));
    expect(all).toHaveLength(424);
  });

  it('parseTrackerFilters round-trips repeated crew and part, and ignores unknown keys', () => {
    const f = parseTrackerFilters(new URLSearchParams('crew=MIBS&crew=PANELS&part=3&part=4&bogus=1&issue=pending&verified=no'));
    expect(f).toEqual({ crew: ['MIBS', 'PANELS'], partId: [3, 4], issue: 'pending', verified: false });
    const again = parseTrackerFilters(trackerFiltersToQuery(f));
    expect(again).toEqual(f);
    expect(parseTrackerFilters({ crew: ['A', 'B'], q: 'x', nope: 'y' })).toEqual({ crew: ['A', 'B'], q: 'x' });
  });

  it('a value that is not allowed is ignored', () => {
    expect(parseTrackerFilters(new URLSearchParams('issue=maybe&sort=random&from=yesterday'))).toEqual({});
  });
});
