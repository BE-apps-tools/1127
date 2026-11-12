import { describe, it, expect, beforeAll } from 'vitest';
import type { Db } from '@/server/db/types';
import { getMatrix } from '@/server/services/matrix';
import { verifyRequisition } from '@/server/services/requisitions';
import { seededDb } from '../helpers/db';

let db: Db;
beforeAll(async () => {
  db = await seededDb();
});

describe('matrix service', () => {
  it('has 52 rows, 20 columns, 409 cells and 13 repeat cells', async () => {
    const m = await getMatrix(db, { mode: 'issued', verifiedOnly: false });
    expect(m.rows).toHaveLength(52);
    expect(m.columns).toHaveLength(20);
    expect(Object.keys(m.cells)).toHaveLength(409);
    expect(Object.values(m.cells).filter((c) => c.requisitionCount > 1)).toHaveLength(13);
    const req = await getMatrix(db, { mode: 'requested', verifiedOnly: false });
    expect(Object.keys(req.cells)).toHaveLength(409);
  });

  it('PB 37 / 25233-00 is 440 from 2 requisitions in issued mode', async () => {
    const m = await getMatrix(db, { mode: 'issued', verifiedOnly: false });
    const col = m.columns.find((c) => c.partNumber === '25233-00')!;
    expect(m.cells[`37|${col.partId}`]).toEqual({ qty: 440, requisitionCount: 2 });
  });

  it('numeric rows come first in ascending order, text rows after', async () => {
    const m = await getMatrix(db, { mode: 'issued', verifiedOnly: false });
    const numeric = m.rows.filter((r) => r.pbNumber != null).map((r) => r.pbNumber as number);
    expect(numeric).toEqual([...numeric].sort((a, b) => a - b));
    expect(m.rows[m.rows.length - 1]).toEqual({ pbLocation: 'FOR LDYs', pbNumber: null });
    expect(m.rows.findIndex((r) => r.pbNumber == null)).toBe(numeric.length);
  });

  it('columns follow crew order, then any other part by number', async () => {
    const m = await getMatrix(db, { mode: 'issued', verifiedOnly: false });
    expect(m.columns[0].crewCode).toBe(m.columns.find((c) => c.crewCode)!.crewCode);
    const crewOrder = (await db.query<{ code: string }>(`select code from crews order by sort_order`)).map((c) => c.code);
    const seen = m.columns.map((c) => crewOrder.indexOf(c.crewCode ?? ''));
    const known = seen.filter((i) => i >= 0);
    expect(known).toEqual([...known].sort((a, b) => a - b));
  });

  it('row and column totals each add up to 910,880 in issued mode', async () => {
    const m = await getMatrix(db, { mode: 'issued', verifiedOnly: false });
    const sum = (o: Record<string, number>) => Object.values(o).reduce((a, b) => a + b, 0);
    expect(sum(m.rowTotals)).toBe(910880);
    expect(sum(m.columnTotals)).toBe(910880);
  });

  it('verifiedOnly gives no cells on a fresh seed, then that requisition after verifying it', async () => {
    const fresh = await seededDb();
    expect(Object.keys((await getMatrix(fresh, { mode: 'issued', verifiedOnly: true })).cells)).toHaveLength(0);
    const [r] = await fresh.query<{ id: number }>(`select id from requisitions where req_number = 'MFR-000037'`);
    const [u] = await fresh.query<{ id: number }>(`select id from app_users limit 1`);
    await verifyRequisition(fresh, r.id, u.id);
    const m = await getMatrix(fresh, { mode: 'issued', verifiedOnly: true });
    const lineCount = (await fresh.query<{ n: number }>(`select count(distinct part_id)::integer as n from requisition_lines where requisition_id = $1 and part_id is not null`, [r.id]))[0].n;
    expect(Object.keys(m.cells)).toHaveLength(lineCount);
    expect(lineCount).toBe(2);
  });
});
