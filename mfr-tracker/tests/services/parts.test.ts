import { describe, it, expect } from 'vitest';
import { AppError } from '@/server/errors';
import { createPart, listParts, mergePart, updatePart } from '@/server/services/parts';
import { createCrew, listCrews, updateCrew } from '@/server/services/crews';
import { createPerson, listPeople, updatePerson } from '@/server/services/people';
import { seededDb } from '../helpers/db';

const userOf = async (db: Awaited<ReturnType<typeof seededDb>>) => (await db.query<{ id: number }>(`select id from app_users limit 1`))[0].id;
const partId = async (db: Awaited<ReturnType<typeof seededDb>>, pn: string) => (await db.query<{ id: number }>(`select id from parts where part_number = $1`, [pn]))[0].id;

describe('parts service', () => {
  it('merges 61018-063 into 60819-063 as the contract table says', async () => {
    const db = await seededDb();
    const uid = await userOf(db);
    const from = await partId(db, '61018-063');
    const into = await partId(db, '60819-063');
    await mergePart(db, from, into, uid);

    const [agg] = await db.query<{ lines: number; issued: number }>(
      `select count(*)::integer as lines, sum(qty_issued)::integer as issued from requisition_lines where part_id = $1`,
      [into],
    );
    expect(agg).toEqual({ lines: 6, issued: 140908 });
    expect((await db.query<{ n: number }>(`select count(*)::integer as n from requisition_lines where part_id = $1`, [from]))[0].n).toBe(0);

    const [old] = await db.query<{ is_active: boolean; merged_into_id: number; needs_review: boolean }>(
      `select is_active, merged_into_id, needs_review from parts where id = $1`,
      [from],
    );
    expect(old).toEqual({ is_active: false, merged_into_id: into, needs_review: false });

    const aliases = await db.query<{ alias: string; part_id: number }>(`select alias, part_id from part_aliases where alias in ('61018', '61018-063') order by alias`);
    expect(aliases).toEqual([
      { alias: '61018', part_id: into },
      { alias: '61018-063', part_id: into },
    ]);

    const panels = await db.query<{ part_id: number }>(
      `select cp.part_id from crew_parts cp join crews c on c.id = cp.crew_id where c.code = 'PANELS' order by cp.sort_order`,
    );
    expect(panels[2].part_id).toBe(into);
    expect(panels).toHaveLength(4);
    expect((await db.query<{ n: number }>(`select count(*)::integer as n from audit_log where action = 'part.merge'`))[0].n).toBe(1);
  });

  it('refuses to merge a part into itself or into an inactive part', async () => {
    const db = await seededDb();
    const uid = await userOf(db);
    const a = await partId(db, '25050-001');
    const b = await partId(db, '25056-001');
    await expect(mergePart(db, a, a, uid)).rejects.toThrow();
    await mergePart(db, a, b, uid);
    const c = await partId(db, '25244-000');
    await expect(mergePart(db, c, a, uid)).rejects.toThrow();
  });

  it('create stores the number trimmed and uppercased; a duplicate number is a conflict', async () => {
    const db = await seededDb();
    const uid = await userOf(db);
    const created = await createPart(db, { partNumber: ' ab-100 ', descriptionOfficial: 'Test part', fieldName: null, eachPerBox: null, eachPerPallet: null, needsReview: true, notes: null, aliases: ['ab1', ' ab-1 '] }, uid);
    const [row] = await db.query<{ part_number: string }>(`select part_number from parts where id = $1`, [created.id]);
    expect(row.part_number).toBe('AB-100');
    const aliases = await db.query<{ alias: string }>(`select alias from part_aliases where part_id = $1 order by alias`, [created.id]);
    expect(aliases.map((a) => a.alias)).toEqual(['AB-1', 'AB1']);
    const err = await createPart(db, { partNumber: 'ab-100', descriptionOfficial: null, fieldName: null, eachPerBox: null, eachPerPallet: null, needsReview: false, notes: null, aliases: [] }, uid).catch((e) => e);
    expect(err).toBeInstanceOf(AppError);
    expect((err as AppError).code).toBe('conflict');
  });

  it('update replaces the aliases', async () => {
    const db = await seededDb();
    const uid = await userOf(db);
    const id = await partId(db, '60825-300');
    const before = (await listParts(db, {})).find((p) => p.id === id)!;
    expect(before.aliases).toEqual(['60825']);
    await updatePart(db, id, { aliases: ['60825A', '60825B'], notes: 'checked' }, uid);
    const after = (await listParts(db, {})).find((p) => p.id === id)!;
    expect(after.aliases).toEqual(['60825A', '60825B']);
    expect(after.notes).toBe('checked');
    expect(after.partNumber).toBe('60825-300');
  });

  it('listParts filters by needs review and counts lines', async () => {
    const db = await seededDb();
    const review = await listParts(db, { review: true });
    expect(review).toHaveLength(5);
    const p = (await listParts(db, { q: '25050' }))[0];
    expect(p.partNumber).toBe('25050-001');
    expect(p.lineCount).toBe(29);
  });
});

describe('crews and people services', () => {
  it('saving a crew replaces its ordered part list', async () => {
    const db = await seededDb();
    const uid = await userOf(db);
    const crew = (await listCrews(db)).find((c) => c.code === 'MIBS')!;
    const [a, b, c] = [await partId(db, '25050-001'), await partId(db, '25056-001'), await partId(db, '25244-000')];
    await updateCrew(db, crew.id, { name: crew.name, defaultRequesterId: crew.defaultRequesterId, isActive: true, partIds: [c, a, b] }, uid);
    const after = (await listCrews(db)).find((x) => x.id === crew.id)!;
    expect(after.parts.map((p) => p.partId)).toEqual([c, a, b]);
  });

  it('creates a crew with a generated code', async () => {
    const db = await seededDb();
    const uid = await userOf(db);
    const created = await createCrew(db, { name: 'Night Shift', defaultRequesterId: null, isActive: true, partIds: [] }, uid);
    const crew = (await listCrews(db)).find((x) => x.id === created.id)!;
    expect(crew.code).toBe('NIGHT_SHIFT');
    expect(crew.sortOrder).toBe(7);
  });

  it('creates and updates people', async () => {
    const db = await seededDb();
    const uid = await userOf(db);
    const created = await createPerson(db, { fullName: 'Pat Approver', isRequester: false, isApprover: true, isActive: true }, uid);
    await updatePerson(db, created.id, { isActive: false }, uid);
    const p = (await listPeople(db)).find((x) => x.id === created.id)!;
    expect(p).toMatchObject({ fullName: 'Pat Approver', isApprover: true, isRequester: false, isActive: false });
  });
});
