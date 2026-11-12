import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { createPgliteDb } from '@/server/db/pglite';
import { migrate } from '@/server/db/migrate';

const dir = path.resolve(__dirname, '../../db/migrations');

describe('migrate', () => {
  it('creates the tables and views of 0001_init.sql and is idempotent', async () => {
    const db = await createPgliteDb();
    const applied = await migrate(db, dir);
    expect(applied).toEqual(['0001_init.sql']);

    const tables = await db.query<{ table_name: string }>(
      `select table_name from information_schema.tables
       where table_schema = 'public' and table_type = 'BASE TABLE' and table_name <> 'schema_migrations'`,
    );
    // 0001_init.sql defines 12 tables (the plan text says 11; the SQL is the authority).
    expect(tables).toHaveLength(12);
    const views = await db.query<{ table_name: string }>(
      `select table_name from information_schema.views where table_schema = 'public' order by 1`,
    );
    expect(views.map((v) => v.table_name)).toEqual(['v_pb_part_matrix', 'v_tracker_lines']);

    const again = await migrate(db, dir);
    expect(again).toEqual([]);
    const rows = await db.query(`select filename from schema_migrations`);
    expect(rows).toHaveLength(1);
    await db.close();
  });
});
