import fs from 'node:fs';
import path from 'node:path';
import type { Db } from './types';

/** Applies each *.sql file in name order that is not yet recorded. Returns the filenames applied now. */
export async function migrate(db: Db, dir: string): Promise<string[]> {
  await db.exec(
    `create table if not exists schema_migrations (
       filename text primary key,
       applied_at timestamptz not null default now()
     )`,
  );
  const done = new Set((await db.query<{ filename: string }>(`select filename from schema_migrations`)).map((r) => r.filename));
  const files = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.sql'))
    .sort();
  const applied: string[] = [];
  for (const file of files) {
    if (done.has(file)) continue;
    const sql = fs.readFileSync(path.join(dir, file), 'utf8');
    await db.tx(async (tx) => {
      await tx.exec(sql);
      await tx.query(`insert into schema_migrations(filename) values ($1)`, [file]);
    });
    applied.push(file);
  }
  return applied;
}
