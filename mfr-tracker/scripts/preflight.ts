import { loadEnv } from './_env';

loadEnv();

const NAMES = [
  'DATABASE_URL',
  'SUPABASE_URL',
  'SUPABASE_SECRET_KEY',
  'SESSION_SECRET',
  'ANTHROPIC_API_KEY',
  'ANTHROPIC_MODEL',
  'AI_MODE',
  'DATA_DIR',
  'ADMIN_EMAIL',
  'ADMIN_NAME',
  'ADMIN_PASSWORD',
];

async function main() {
  const { getConfig } = await import('../src/server/config');
  const cfg = getConfig();
  let failed = false;

  console.log('Environment variables (set or not set, values are never printed):');
  for (const n of NAMES) console.log(`  ${n.padEnd(20)} ${process.env[n]?.trim() ? 'set' : 'not set'}`);

  console.log('\nActive adapters:');
  console.log(`  database  ${cfg.db === 'pg' ? 'PostgreSQL (DATABASE_URL)' : `PGlite in ${cfg.dataDir}/pg`}`);
  console.log(`  storage   ${cfg.storage === 'supabase' ? `Supabase bucket ${cfg.storageBucket}` : `disk in ${cfg.dataDir}/storage`}`);
  console.log(`  ai        ${cfg.aiMode}${cfg.aiMode === 'anthropic' ? ` (model ${cfg.anthropicModel})` : ''}`);

  console.log('\nChecks:');
  const { getDb, getStorage } = await import('../src/server/container');
  try {
    const db = await getDb();
    const [r] = await db.query<{ n: number }>(`select count(*)::integer as n from schema_migrations`);
    console.log(`  database round trip ok (${r.n} migration${r.n === 1 ? '' : 's'} recorded)`);
  } catch (err) {
    failed = true;
    console.log(`  database FAILED: ${err instanceof Error ? err.message : 'unknown error'}`);
  }
  try {
    const storage = await getStorage();
    const bytes = new Uint8Array([1, 2, 3]);
    await storage.put('preflight/ping.bin', bytes, 'application/octet-stream');
    const back = await storage.get('preflight/ping.bin');
    await storage.remove('preflight/ping.bin');
    if (!back || back.bytes.length !== 3) throw new Error('read back did not match');
    console.log('  storage round trip ok');
  } catch (err) {
    failed = true;
    console.log(`  storage FAILED: ${err instanceof Error ? err.message : 'unknown error'}`);
  }

  if (cfg.anthropicApiKey) {
    try {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      const client = new Anthropic({ apiKey: cfg.anthropicApiKey, maxRetries: 1, timeout: 20_000 });
      const models: Array<{ id: string; created_at: string }> = [];
      for await (const m of client.models.list({ limit: 100 })) models.push({ id: m.id, created_at: String(m.created_at) });
      if (models.some((m) => m.id === cfg.anthropicModel)) {
        console.log(`  model ${cfg.anthropicModel} exists`);
      } else {
        const newest = models
          .filter((m) => m.id.startsWith('claude-sonnet'))
          .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
        console.log(
          `  model ${cfg.anthropicModel} NOT FOUND. ${newest ? `Newest Sonnet id: ${newest.id}. Set ANTHROPIC_MODEL to it.` : 'No Sonnet model was listed.'}`,
        );
      }
    } catch (err) {
      console.log(`  model check skipped: ${err instanceof Error ? err.message.slice(0, 120) : 'request failed'}`);
    }
  } else {
    console.log('  model check skipped (ANTHROPIC_API_KEY not set)');
  }

  const db = await getDb().catch(() => null);
  await db?.close();
  if (failed) process.exit(1);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
