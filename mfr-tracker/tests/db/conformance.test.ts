import { describe, it, expect, afterAll } from 'vitest';
import type { Db } from '@/server/db/types';
import { createPgliteDb } from '@/server/db/pglite';
import { createPgDb } from '@/server/db/pg';

function suite(name: string, make: () => Promise<Db>) {
  describe(`Db conformance: ${name}`, () => {
    let db: Db;
    const table = `conf_${Math.random().toString(36).slice(2, 8)}`;

    it('opens and creates a temp table', async () => {
      db = await make();
      await db.exec(
        `create table ${table} (id integer primary key, n integer, d date, ts timestamptz, j jsonb, a text[], b boolean, big bigint)`,
      );
    });

    it('round-trips values with the contract JS types', async () => {
      await db.query(
        `insert into ${table}(id, n, d, ts, j, a, b, big) values ($1, $2, $3, $4, $5::jsonb, $6, $7, $8)`,
        [1, 7, '2026-11-02', '2026-11-02T10:20:30.000Z', JSON.stringify({ a: [1, 2] }), ['x', 'y'], true, 12345678901],
      );
      const [row] = await db.query<Record<string, unknown>>(`select * from ${table} where id = 1`);
      expect(row.n).toBe(7);
      expect(row.d).toBe('2026-11-02');
      expect(row.ts).toBe('2026-11-02T10:20:30.000Z');
      expect(row.j).toEqual({ a: [1, 2] });
      expect(row.a).toEqual(['x', 'y']);
      expect(row.b).toBe(true);
      expect(row.big).toBe(12345678901);
      expect(typeof row.big).toBe('number');
    });

    it('returns count(*) as a JS number', async () => {
      const [r] = await db.query<{ n: unknown }>(`select count(*) as n from ${table}`);
      expect(r.n).toBe(1);
      expect(typeof r.n).toBe('number');
    });

    it('tx commits on success', async () => {
      await db.tx(async (t) => {
        await t.query(`insert into ${table}(id) values ($1)`, [10]);
      });
      const rows = await db.query(`select id from ${table} where id = 10`);
      expect(rows).toHaveLength(1);
    });

    it('tx rolls back when the callback throws and rethrows the error', async () => {
      await expect(
        db.tx(async (t) => {
          await t.query(`insert into ${table}(id) values ($1)`, [11]);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      const rows = await db.query(`select id from ${table} where id = 11`);
      expect(rows).toHaveLength(0);
    });

    it('exec runs a two-statement script', async () => {
      await db.exec(`insert into ${table}(id) values (20); insert into ${table}(id) values (21);`);
      const rows = await db.query(`select id from ${table} where id in (20, 21)`);
      expect(rows).toHaveLength(2);
    });

    afterAll(async () => {
      if (db) {
        await db.exec(`drop table if exists ${table}`);
        await db.close();
      }
    });
  });
}

suite('pglite', async () => createPgliteDb());

if (process.env.TEST_DATABASE_URL) {
  suite('postgres', async () => createPgDb(process.env.TEST_DATABASE_URL as string));
}
