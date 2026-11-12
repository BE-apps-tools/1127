import path from 'node:path';
import { loadEnv } from './_env';

loadEnv();

async function main() {
  const { getConfig } = await import('../src/server/config');
  const { migrate } = await import('../src/server/db/migrate');
  const cfg = getConfig();
  let db;
  if (cfg.db === 'pg') {
    const { createPgDb } = await import('../src/server/db/pg');
    db = await createPgDb(cfg.databaseUrl as string);
  } else {
    const { mkdirSync } = await import('node:fs');
    const { createPgliteDb } = await import('../src/server/db/pglite');
    mkdirSync(cfg.dataDir, { recursive: true });
    db = await createPgliteDb(path.join(cfg.dataDir, 'pg'));
  }
  const applied = await migrate(db, path.resolve('db', 'migrations'));
  console.log(applied.length ? `Applied: ${applied.join(', ')}` : 'No pending migrations.');
  await db.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
