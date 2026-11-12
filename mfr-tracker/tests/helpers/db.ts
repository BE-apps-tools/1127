import path from 'node:path';
import type { Db } from '@/server/db/types';
import { createPgliteDb } from '@/server/db/pglite';
import { migrate } from '@/server/db/migrate';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

/** A new in-memory database with all migrations applied. */
export async function freshDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db, MIGRATIONS_DIR);
  return db;
}
