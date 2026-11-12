import type { Db } from '../db/types';
import { AppError } from '../errors';
import { audit } from './audit';

export interface PartRow {
  id: number;
  partNumber: string;
  descriptionOfficial: string | null;
  fieldName: string | null;
  uom: string;
  eachPerBox: number | null;
  eachPerPallet: number | null;
  needsReview: boolean;
  notes: string | null;
  isActive: boolean;
  mergedIntoId: number | null;
  aliases: string[];
  lineCount: number;
}

export interface PartInput {
  partNumber: string;
  descriptionOfficial: string | null;
  fieldName: string | null;
  uom?: string;
  eachPerBox: number | null;
  eachPerPallet: number | null;
  needsReview: boolean;
  notes: string | null;
  isActive?: boolean;
  aliases: string[];
}

const norm = (s: string) => s.trim().toUpperCase();

function cleanAliases(aliases: string[], partNumber: string): string[] {
  return [...new Set(aliases.map(norm).filter((a) => a !== '' && a !== partNumber))].sort();
}

function checkPack(n: number | null, label: string) {
  if (n != null && (!Number.isInteger(n) || n < 1)) throw new AppError('validation', `${label} must be a whole number of 1 or more.`);
}

export async function listParts(db: Db, opts: { q?: string; review?: boolean; includeInactive?: boolean }): Promise<PartRow[]> {
  const rows = await db.query<Omit<PartRow, 'aliases'>>(
    `select p.id, p.part_number as "partNumber", p.description_official as "descriptionOfficial", p.field_name as "fieldName",
            p.uom, p.each_per_box as "eachPerBox", p.each_per_pallet as "eachPerPallet", p.needs_review as "needsReview",
            p.notes, p.is_active as "isActive", p.merged_into_id as "mergedIntoId",
            (select count(*) from requisition_lines l where l.part_id = p.id)::integer as "lineCount"
     from parts p
     where ($1::boolean or p.is_active)
       and ($2::boolean is not true or (p.needs_review and p.is_active))
       and ($3::text is null
            or position(lower($3) in lower(p.part_number || ' ' || coalesce(p.field_name, '') || ' ' || coalesce(p.description_official, ''))) > 0)
     order by p.part_number`,
    [opts.includeInactive ?? false, opts.review ?? false, opts.q?.trim() || null],
  );
  const aliases = await db.query<{ alias: string; part_id: number }>(`select alias, part_id from part_aliases order by alias`);
  return rows.map((r) => ({ ...r, aliases: aliases.filter((a) => a.part_id === r.id).map((a) => a.alias) }));
}

async function writeAliases(db: Db, partId: number, partNumber: string, aliases: string[]): Promise<void> {
  const wanted = cleanAliases(aliases, partNumber);
  for (const alias of wanted) {
    const [taken] = await db.query<{ part_id: number }>(`select part_id from part_aliases where alias = $1`, [alias]);
    if (taken && taken.part_id !== partId) throw new AppError('conflict', `The alias ${alias} already belongs to another part.`);
    const [other] = await db.query<{ id: number }>(`select id from parts where part_number = $1 and id <> $2`, [alias, partId]);
    if (other) throw new AppError('conflict', `${alias} is already a part number.`);
  }
  await db.query(`delete from part_aliases where part_id = $1`, [partId]);
  for (const alias of wanted) await db.query(`insert into part_aliases(alias, part_id) values ($1, $2)`, [alias, partId]);
}

export async function createPart(db: Db, input: PartInput, userId: number): Promise<{ id: number }> {
  const partNumber = norm(input.partNumber);
  if (!partNumber) throw new AppError('validation', 'Enter a part number.');
  checkPack(input.eachPerBox, 'Each per box');
  checkPack(input.eachPerPallet, 'Each per pallet');
  return db.tx(async (tx) => {
    const dup = await tx.query(`select 1 from parts where part_number = $1`, [partNumber]);
    if (dup.length) throw new AppError('conflict', `Part ${partNumber} already exists.`);
    const [row] = await tx.query<{ id: number }>(
      `insert into parts(part_number, description_official, field_name, uom, each_per_box, each_per_pallet, needs_review, notes, is_active)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
      [partNumber, input.descriptionOfficial, input.fieldName, input.uom?.trim() || 'EA', input.eachPerBox, input.eachPerPallet,
       input.needsReview, input.notes, input.isActive ?? true],
    );
    await writeAliases(tx, row.id, partNumber, input.aliases);
    await audit(tx, { userId, action: 'part.create', entity: 'part', entityId: row.id, detail: { partNumber } });
    return row;
  });
}

export async function updatePart(db: Db, id: number, patch: Partial<PartInput>, userId: number): Promise<void> {
  if (patch.eachPerBox !== undefined) checkPack(patch.eachPerBox, 'Each per box');
  if (patch.eachPerPallet !== undefined) checkPack(patch.eachPerPallet, 'Each per pallet');
  await db.tx(async (tx) => {
    const [cur] = await tx.query<{ part_number: string }>(`select part_number from parts where id = $1`, [id]);
    if (!cur) throw new AppError('not_found', 'Part not found.');
    let partNumber = cur.part_number;
    if (patch.partNumber !== undefined) {
      partNumber = norm(patch.partNumber);
      if (!partNumber) throw new AppError('validation', 'Enter a part number.');
      const dup = await tx.query(`select 1 from parts where part_number = $1 and id <> $2`, [partNumber, id]);
      if (dup.length) throw new AppError('conflict', `Part ${partNumber} already exists.`);
    }
    // Only fields present in the patch change; `set` flags say which.
    const has = (k: keyof PartInput) => (patch[k] !== undefined ? 1 : 0);
    await tx.query(
      `update parts set
         part_number = $2,
         description_official = case when $3 = 1 then $4 else description_official end,
         field_name = case when $5 = 1 then $6 else field_name end,
         uom = case when $7 = 1 then $8 else uom end,
         each_per_box = case when $9 = 1 then $10 else each_per_box end,
         each_per_pallet = case when $11 = 1 then $12 else each_per_pallet end,
         needs_review = case when $13 = 1 then $14 else needs_review end,
         notes = case when $15 = 1 then $16 else notes end,
         is_active = case when $17 = 1 then $18 else is_active end,
         updated_at = now()
       where id = $1`,
      [id, partNumber,
       has('descriptionOfficial'), patch.descriptionOfficial ?? null,
       has('fieldName'), patch.fieldName ?? null,
       has('uom'), patch.uom?.trim() || 'EA',
       has('eachPerBox'), patch.eachPerBox ?? null,
       has('eachPerPallet'), patch.eachPerPallet ?? null,
       has('needsReview'), patch.needsReview ?? false,
       has('notes'), patch.notes ?? null,
       has('isActive'), patch.isActive ?? true],
    );
    if (patch.aliases !== undefined) await writeAliases(tx, id, partNumber, patch.aliases);
    await audit(tx, { userId, action: 'part.update', entity: 'part', entityId: id, detail: { fields: Object.keys(patch) } });
  });
}

/** Moves every reference from one part to another, retires the first and keeps its numbers as aliases. */
export async function mergePart(db: Db, fromId: number, intoId: number, userId: number): Promise<void> {
  if (fromId === intoId) throw new AppError('validation', 'Choose a different part to merge into.');
  await db.tx(async (tx) => {
    const [from] = await tx.query<{ id: number; part_number: string; is_active: boolean }>(`select id, part_number, is_active from parts where id = $1`, [fromId]);
    const [into] = await tx.query<{ id: number; part_number: string; is_active: boolean }>(`select id, part_number, is_active from parts where id = $1`, [intoId]);
    if (!from || !into) throw new AppError('not_found', 'Part not found.');
    if (!into.is_active) throw new AppError('conflict', 'Cannot merge into an inactive part.');
    if (!from.is_active) throw new AppError('conflict', 'That part has already been merged or retired.');

    const moved = await tx.query(`update requisition_lines set part_id = $2 where part_id = $1 returning id`, [fromId, intoId]);

    const crews = await tx.query<{ crew_id: number }>(`select crew_id from crew_parts where part_id = $1`, [fromId]);
    for (const { crew_id } of crews) {
      const already = await tx.query(`select 1 from crew_parts where crew_id = $1 and part_id = $2`, [crew_id, intoId]);
      if (already.length) await tx.query(`delete from crew_parts where crew_id = $1 and part_id = $2`, [crew_id, fromId]);
      else await tx.query(`update crew_parts set part_id = $3 where crew_id = $1 and part_id = $2`, [crew_id, fromId, intoId]);
    }

    await tx.query(`update part_aliases set part_id = $2 where part_id = $1`, [fromId, intoId]);
    const free = await tx.query(`select 1 from part_aliases where alias = $1`, [from.part_number]);
    if (!free.length) await tx.query(`insert into part_aliases(alias, part_id) values ($1, $2)`, [from.part_number, intoId]);

    await tx.query(`update parts set is_active = false, merged_into_id = $2, needs_review = false, updated_at = now() where id = $1`, [fromId, intoId]);
    await audit(tx, {
      userId,
      action: 'part.merge',
      entity: 'part',
      entityId: fromId,
      detail: { from: from.part_number, into: into.part_number, intoId, linesMoved: moved.length },
    });
  });
}
