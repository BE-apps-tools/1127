import path from 'node:path';
import { getConfig } from './config';
import type { Db } from './db/types';
import type { Storage } from './storage/types';
import type { AiExtractor } from './ai/types';

const MIGRATIONS_DIR = path.join(process.cwd(), 'db', 'migrations');

interface Globals {
  __mfrDb?: Promise<Db>;
  __mfrStorage?: Storage;
  __mfrAi?: AiExtractor;
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

/** One storage adapter per process: Supabase when both variables are set, otherwise disk under DATA_DIR. */
export async function getStorage(): Promise<Storage> {
  if (!g.__mfrStorage) {
    const cfg = getConfig();
    if (cfg.storage === 'supabase') {
      const { createSupabaseStorage } = await import('./storage/supabase');
      g.__mfrStorage = createSupabaseStorage(cfg.supabaseUrl as string, cfg.supabaseSecretKey as string, cfg.storageBucket);
    } else {
      const { createLocalStorage } = await import('./storage/local');
      g.__mfrStorage = createLocalStorage(path.join(cfg.dataDir, 'storage'));
    }
  }
  return g.__mfrStorage;
}

/** AI adapter chosen by AI_MODE: anthropic, mock or off. */
export async function getAi(): Promise<AiExtractor> {
  if (!g.__mfrAi) {
    const cfg = getConfig();
    if (cfg.aiMode === 'anthropic') {
      if (!cfg.anthropicApiKey) throw new Error('AI_MODE is anthropic but ANTHROPIC_API_KEY is not set.');
      const { createAnthropicExtractor } = await import('./ai/anthropic');
      g.__mfrAi = createAnthropicExtractor(cfg.anthropicApiKey, cfg.anthropicModel);
    } else if (cfg.aiMode === 'mock') {
      g.__mfrAi = (await import('./ai/mock')).createMockExtractor();
    } else {
      g.__mfrAi = (await import('./ai/off')).createOffExtractor();
    }
  }
  return g.__mfrAi;
}
