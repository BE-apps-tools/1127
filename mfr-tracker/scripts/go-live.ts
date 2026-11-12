import { execFileSync } from 'node:child_process';
import { loadEnv } from './_env';

loadEnv();

function step(title: string, script: string) {
  console.log(`\n== ${title} ==`);
  execFileSync('npx', ['tsx', script], { stdio: 'inherit', env: process.env });
}

async function main() {
  const { cloudVarsMissing, getConfig } = await import('../src/server/config');
  const missing = cloudVarsMissing(process.env);
  if (missing.length) {
    console.error('go-live needs these environment variables, which are not set:');
    for (const m of missing) console.error(`  ${m}`);
    console.error('Put them in .env.local (see .env.example and docs/GO_LIVE.md), then run npm run go-live again.');
    process.exit(1);
  }
  const cfg = getConfig();

  // The storage check in preflight needs the bucket, so create it first. Creating it twice is harmless.
  console.log('== Storage bucket ==');
  const { ensureBucket } = await import('../src/server/storage/supabase');
  await ensureBucket(cfg.supabaseUrl as string, cfg.supabaseSecretKey as string, cfg.storageBucket);
  console.log(`Bucket ${cfg.storageBucket} is ready (private).`);

  step('Preflight', 'scripts/preflight.ts');
  step('Migrate', 'scripts/migrate.ts');
  step('Seed', 'scripts/seed.ts');

  console.log('\nGo-live finished.');
  console.log(`Sign in as ${process.env.ADMIN_EMAIL} with the ADMIN_PASSWORD you set. You will be asked to choose a new password.`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
