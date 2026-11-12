import path from 'node:path';
import { getConfig } from './config';
import type { Db } from './db/types';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

interface Globals {
  __mfrDb?: Promise<Db>;
}
const g = globalThis as unknown as Globals;

async function open(): Promise<Db> {
  const cfg = getConfig();
  if (cfg.db === 'pg') {
    const { createPgDb } = await import('./db/pg');
    return createPgDb(cfg.databaseUrl as string);
  }
  // PGlite is loaded only in local mode.
  const { createPgliteDb } = await import('./db/pglite');
  const { migrate } = await import('./db/migrate');
  const { mkdirSync } = await import('node:fs');
  const dir = path.join(cfg.dataDir, 'pg');
  mkdirSync(cfg.dataDir, { recursive: true });
  const db = await createPgliteDb(dir);
  await migrate(db, MIGRATIONS_DIR);
  return db;
}

/** One database per process, memoised on globalThis so dev-mode reloads reuse it. */
export function getDb(): Promise<Db> {
  if (!g.__mfrDb) {
    g.__mfrDb = open().catch((err) => {
      g.__mfrDb = undefined;
      throw err;
    });
  }
  return g.__mfrDb;
}
