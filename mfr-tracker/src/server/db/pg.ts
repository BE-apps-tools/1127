import pg from 'pg';
import type { Db } from './types';

// Set once for the whole process. These match the PGlite parsers so both drivers return the same JS values.
pg.types.setTypeParser(20, (v: string) => Number(v));
pg.types.setTypeParser(1082, (v: string) => v);
pg.types.setTypeParser(1184, (v: string) => new Date(v).toISOString());

type Runner = Pick<pg.Pool, 'query'> | Pick<pg.PoolClient, 'query'>;

function wrap(runner: Runner, pool: pg.Pool | null): Db {
  return {
    async query<T = Record<string, unknown>>(sql: string, params?: unknown[]) {
      // No query name is passed, so no named prepared statements (transaction pooler).
      const res = await (runner as pg.Pool).query(sql, params ?? []);
      return res.rows as T[];
    },
    async exec(sql: string) {
      await (runner as pg.Pool).query(sql);
    },
    async tx<T>(fn: (t: Db) => Promise<T>): Promise<T> {
      if (!pool) throw new Error('Nested transactions are not allowed');
      const client = await pool.connect();
      try {
        await client.query('BEGIN');
        const out = await fn(wrap(client, null));
        await client.query('COMMIT');
        return out;
      } catch (err) {
        try {
          await client.query('ROLLBACK');
        } catch {
          // The original error matters more than a failed rollback.
        }
        throw err;
      } finally {
        client.release();
      }
    },
    async close() {
      if (pool) await pool.end();
    },
  };
}

export async function createPgDb(url: string): Promise<Db> {
  const pool = new pg.Pool({ connectionString: url, max: 3, ssl: { rejectUnauthorized: false } });
  return wrap(pool, pool);
}
