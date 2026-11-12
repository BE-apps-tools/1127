import type { Db } from '../db/types';
import { AppError } from '../errors';
import { audit } from './audit';

export interface PersonRow {
  id: number;
  fullName: string;
  isRequester: boolean;
  isApprover: boolean;
  isActive: boolean;
}

export type PersonInput = Omit<PersonRow, 'id'>;

export async function listPeople(db: Db): Promise<PersonRow[]> {
  return db.query<PersonRow>(
    `select id, full_name as "fullName", is_requester as "isRequester", is_approver as "isApprover", is_active as "isActive"
     from people order by full_name`,
  );
}

export async function createPerson(db: Db, input: PersonInput, userId: number): Promise<{ id: number }> {
  const name = input.fullName.trim();
  if (!name) throw new AppError('validation', 'Enter a name.');
  const dup = await db.query(`select 1 from people where lower(full_name) = lower($1)`, [name]);
  if (dup.length) throw new AppError('conflict', `${name} is already in the list.`);
  const [row] = await db.query<{ id: number }>(
    `insert into people(full_name, is_requester, is_approver, is_active) values ($1, $2, $3, $4) returning id`,
    [name, input.isRequester, input.isApprover, input.isActive],
  );
  await audit(db, { userId, action: 'people.update', entity: 'person', entityId: row.id, detail: { created: true } });
  return row;
}

export async function updatePerson(db: Db, id: number, patch: Partial<PersonInput>, userId: number): Promise<void> {
  const name = patch.fullName?.trim();
  if (patch.fullName !== undefined && !name) throw new AppError('validation', 'Enter a name.');
  if (name) {
    const dup = await db.query(`select 1 from people where lower(full_name) = lower($1) and id <> $2`, [name, id]);
    if (dup.length) throw new AppError('conflict', `${name} is already in the list.`);
  }
  const rows = await db.query(
    `update people set full_name = coalesce($2, full_name), is_requester = coalesce($3, is_requester),
            is_approver = coalesce($4, is_approver), is_active = coalesce($5, is_active)
     where id = $1 returning id`,
    [id, name ?? null, patch.isRequester ?? null, patch.isApprover ?? null, patch.isActive ?? null],
  );
  if (!rows.length) throw new AppError('not_found', 'Person not found.');
  await audit(db, { userId, action: 'people.update', entity: 'person', entityId: id, detail: { fields: Object.keys(patch) } });
}
