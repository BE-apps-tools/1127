import path from 'node:path';
import type { Db } from '@/server/db/types';
import { createPgliteDb } from '@/server/db/pglite';
import { migrate } from '@/server/db/migrate';
import type { Storage } from '@/server/storage/types';
import { seedDatabase } from '@/server/services/seed';

export const MIGRATIONS_DIR = path.resolve(__dirname, '../../db/migrations');

/** A new in-memory database with all migrations applied. */
export async function freshDb(): Promise<Db> {
  const db = await createPgliteDb();
  await migrate(db, MIGRATIONS_DIR);
  return db;
}

export const SEED_ADMIN = { email: 'admin@local.test', name: 'Site Admin', password: 'LocalTest#12345' };
export const KIT_DIR = path.resolve(__dirname, '../..');

export interface MemoryStorage extends Storage {
  map: Map<string, { bytes: Uint8Array; contentType: string }>;
}

/** In-memory Storage fake backed by a Map. */
export function memoryStorage(): MemoryStorage {
  const map = new Map<string, { bytes: Uint8Array; contentType: string }>();
  return {
    map,
    async put(key, bytes, contentType) {
      map.set(key, { bytes, contentType });
    },
    async get(key) {
      return map.get(key) ?? null;
    },
    async remove(key) {
      map.delete(key);
    },
  };
}

/** A fresh database with master data, 148 pages, 140 requisitions and the admin user seeded. */
export async function seededDb(storage: Storage = memoryStorage()): Promise<Db> {
  const db = await freshDb();
  await seedDatabase(db, storage, KIT_DIR, SEED_ADMIN);
  return db;
}
