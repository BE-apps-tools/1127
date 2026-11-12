import type { Db } from '../db/types';
import { AppError } from '../errors';
import type { CrewCheck } from '@/domain/types';
import { audit } from './audit';

export interface CrewRow {
  id: number;
  code: string;
  name: string;
  defaultRequesterId: number | null;
  checks: CrewCheck[];
  sortOrder: number;
  isActive: boolean;
  parts: Array<{ partId: number; partNumber: string; label: string }>;
}

export interface CrewInput {
  name: string;
  defaultRequesterId: number | null;
  isActive: boolean;
  partIds: number[];
}

export async function listCrews(db: Db): Promise<CrewRow[]> {
  const crews = await db.query<Omit<CrewRow, 'parts'>>(
    `select id, code, name, default_requester_id as "defaultRequesterId", checks, sort_order as "sortOrder", is_active as "isActive"
     from crews order by sort_order, id`,
  );
  const parts = await db.query<{ crewId: number; partId: number; partNumber: string; label: string }>(
    `select cp.crew_id as "crewId", cp.part_id as "partId", p.part_number as "partNumber",
            coalesce(p.field_name, p.description_official, p.part_number) as label
     from crew_parts cp join parts p on p.id = cp.part_id order by cp.crew_id, cp.sort_order`,
  );
  return crews.map((c) => ({
    ...c,
    parts: parts.filter((p) => p.crewId === c.id).map(({ partId, partNumber, label }) => ({ partId, partNumber, label })),
  }));
}

async function replaceParts(db: Db, crewId: number, partIds: number[]): Promise<void> {
  const unique = [...new Set(partIds)];
  if (unique.length) {
    const found = await db.query<{ id: number }>(`select id from parts where id = any($1::integer[])`, [unique]);
    if (found.length !== unique.length) throw new AppError('validation', 'A listed part does not exist.');
  }
  await db.query(`delete from crew_parts where crew_id = $1`, [crewId]);
  let i = 0;
  for (const partId of unique) await db.query(`insert into crew_parts(crew_id, part_id, sort_order) values ($1, $2, $3)`, [crewId, partId, i++]);
}

function requireName(name: string): string {
  const n = name.trim();
  if (!n) throw new AppError('validation', 'Enter a crew name.');
  return n;
}

export async function createCrew(db: Db, input: CrewInput, userId: number): Promise<{ id: number }> {
  const name = requireName(input.name);
  return db.tx(async (tx) => {
    const base = name.toUpperCase().replace(/[^A-Z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'CREW';
    let code = base;
    for (let n = 2; (await tx.query(`select 1 from crews where code = $1`, [code])).length; n++) code = `${base}_${n}`;
    const [{ next }] = await tx.query<{ next: number }>(`select coalesce(max(sort_order) + 1, 0)::integer as next from crews`);
    const [row] = await tx.query<{ id: number }>(
      `insert into crews(code, name, default_requester_id, checks, sort_order, is_active) values ($1, $2, $3, '[]'::jsonb, $4, $5) returning id`,
      [code, name, input.defaultRequesterId, next, input.isActive],
    );
    await replaceParts(tx, row.id, input.partIds);
    await audit(tx, { userId, action: 'crew.update', entity: 'crew', entityId: row.id, detail: { created: true, code } });
    return row;
  });
}

export async function updateCrew(db: Db, id: number, input: CrewInput, userId: number): Promise<void> {
  const name = requireName(input.name);
  await db.tx(async (tx) => {
    const rows = await tx.query(
      `update crews set name = $2, default_requester_id = $3, is_active = $4 where id = $1 returning id`,
      [id, name, input.defaultRequesterId, input.isActive],
    );
    if (!rows.length) throw new AppError('not_found', 'Crew not found.');
    await replaceParts(tx, id, input.partIds);
    await audit(tx, { userId, action: 'crew.update', entity: 'crew', entityId: id, detail: { partIds: input.partIds } });
  });
}
