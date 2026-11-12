import type { Db } from '../db/types';

export interface MatrixRow {
  pbLocation: string;
  pbNumber: number | null;
}
export interface MatrixColumn {
  partId: number;
  partNumber: string;
  label: string;
  crewCode: string | null;
}
export interface MatrixCell {
  qty: number;
  requisitionCount: number;
}
export interface Matrix {
  rows: MatrixRow[];
  columns: MatrixColumn[];
  cells: Record<string, MatrixCell>;
  rowTotals: Record<string, number>;
  columnTotals: Record<number, number>;
}

export const matrixCellKey = (pbLocation: string, partId: number) => `${pbLocation}|${partId}`;

export async function getMatrix(db: Db, opts: { mode: 'issued' | 'requested'; verifiedOnly: boolean }): Promise<Matrix> {
  // Same joins as v_pb_part_matrix, on the base tables, so the verified filter can apply per requisition.
  const raw = await db.query<{
    pbLocation: string;
    pbNumber: number | null;
    partId: number;
    requested: number;
    issued: number;
    n: number;
  }>(
    `select r.pb_location as "pbLocation", r.pb_number as "pbNumber", l.part_id as "partId",
            sum(coalesce(l.qty_requested, 0))::integer as requested, sum(l.qty_issued)::integer as issued,
            count(distinct r.id)::integer as n
     from requisition_lines l
     join requisitions r on r.id = l.requisition_id and r.status = 'posted'
     join parts p on p.id = l.part_id
     where ($1::boolean = false or r.verified_at is not null)
     group by r.pb_location, r.pb_number, l.part_id`,
    [opts.verifiedOnly],
  );

  const cells: Matrix['cells'] = {};
  const rowTotals: Matrix['rowTotals'] = {};
  const columnTotals: Matrix['columnTotals'] = {};
  const rowMap = new Map<string, MatrixRow>();
  const partIds = new Set<number>();
  for (const c of raw) {
    const qty = opts.mode === 'issued' ? c.issued : c.requested;
    cells[matrixCellKey(c.pbLocation, c.partId)] = { qty, requisitionCount: c.n };
    rowTotals[c.pbLocation] = (rowTotals[c.pbLocation] ?? 0) + qty;
    columnTotals[c.partId] = (columnTotals[c.partId] ?? 0) + qty;
    rowMap.set(c.pbLocation, { pbLocation: c.pbLocation, pbNumber: c.pbNumber });
    partIds.add(c.partId);
  }

  const rows = [...rowMap.values()].sort((a, b) => {
    if (a.pbNumber != null && b.pbNumber != null) return a.pbNumber - b.pbNumber;
    if (a.pbNumber != null) return -1;
    if (b.pbNumber != null) return 1;
    return a.pbLocation.localeCompare(b.pbLocation, 'en', { sensitivity: 'base' });
  });

  // Columns: grouped by the first crew (by sort_order) that lists the part, in that crew's order; others by number.
  const parts = partIds.size
    ? await db.query<{ id: number; partNumber: string; label: string }>(
        `select id, part_number as "partNumber", coalesce(field_name, description_official, part_number) as label
         from parts where id = any($1::integer[])`,
        [[...partIds]],
      )
    : [];
  const crewParts = await db.query<{ code: string; partId: number; crewOrder: number; partOrder: number }>(
    `select c.code, cp.part_id as "partId", c.sort_order as "crewOrder", cp.sort_order as "partOrder"
     from crew_parts cp join crews c on c.id = cp.crew_id order by c.sort_order, c.id, cp.sort_order`,
  );
  const first = new Map<number, { code: string; crewOrder: number; partOrder: number }>();
  for (const cp of crewParts) if (!first.has(cp.partId)) first.set(cp.partId, cp);

  const columns: MatrixColumn[] = parts
    .map((p) => ({ partId: p.id, partNumber: p.partNumber, label: p.label, crewCode: first.get(p.id)?.code ?? null }))
    .sort((a, b) => {
      const fa = first.get(a.partId);
      const fb = first.get(b.partId);
      if (fa && fb) return fa.crewOrder - fb.crewOrder || fa.partOrder - fb.partOrder;
      if (fa) return -1;
      if (fb) return 1;
      return a.partNumber.localeCompare(b.partNumber);
    });

  return { rows, columns, cells, rowTotals, columnTotals };
}
