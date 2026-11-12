import { PGlite } from '@electric-sql/pglite';
import type { Db } from './types';

// OIDs: 20 = int8, 1082 = date, 1184 = timestamptz.
const parsers = {
  20: (v: string) => Number(v),
  1082: (v: string) => v,
  1184: (v: string) => new Date(v).toISOString(),
};

/** PGlite handle types are loose across its query/transaction objects; this is the shared slice we use. */
interface Queryable {
  query<T>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
  exec(sql: string): Promise<unknown>;
}

function wrap(q: Queryable, db: PGlite | null, tx: boolean): Db {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      const res = await q.query<T>(sql, params ?? []);
      return res.rows;
    },
    async exec(sql: string) {
      await q.exec(sql);
    },
    async tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
      if (tx || !db) throw new Error('Nested transactions are not allowed');
      return db.transaction(async (t) => fn(wrap(t as unknown as Queryable, null, true)));
    },
    async close() {
      if (db) await db.close();
    },
  };
}

/** Embedded Postgres. Pass a directory for persistence, or nothing for an in-memory database. */
export async function createPgliteDb(dataDir?: string): Promise<Db> {
  const pg = dataDir ? new PGlite(dataDir, { parsers }) : new PGlite({ parsers });
  await pg.waitReady;
  return wrap(pg as unknown as Queryable, pg, false);
}
