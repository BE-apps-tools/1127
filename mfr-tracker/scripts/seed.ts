import fs from 'node:fs';
import path from 'node:path';
import { loadEnv } from './_env';

loadEnv();

async function main() {
  const { getConfig } = await import('../src/server/config');
  const { getDb, getStorage } = await import('../src/server/container');
  const { seedDatabase } = await import('../src/server/services/seed');
  const { generatePassword } = await import('../src/server/auth/password');

  const cfg = getConfig();
  const db = await getDb();
  const storage = await getStorage();

  const already = await db.query(`select 1 from scan_batches where source = 'seed' limit 1`);
  if (already.length) {
    console.log('already seeded');
    await db.close();
    return;
  }

  const email = process.env.ADMIN_EMAIL?.trim() || (cfg.db === 'pglite' ? 'admin@local.test' : '');
  const name = process.env.ADMIN_NAME?.trim() || (cfg.db === 'pglite' ? 'Site Admin' : '');
  let password = process.env.ADMIN_PASSWORD ?? '';
  let generated = false;
  if (!password) {
    if (cfg.db !== 'pglite') {
      const missing = ['ADMIN_EMAIL', 'ADMIN_NAME', 'ADMIN_PASSWORD'].filter((k) => !process.env[k]);
      console.error(`Missing environment variables for the cloud seed: ${missing.join(', ')}`);
      process.exit(1);
    }
    password = generatePassword();
    generated = true;
  }
  if (!email || !name) {
    console.error('Missing environment variables: ADMIN_EMAIL, ADMIN_NAME');
    process.exit(1);
  }

  const res = await seedDatabase(db, storage, process.cwd(), {
    email,
    name,
    password,
    mustChangePassword: process.env.SEED_SKIP_PASSWORD_CHANGE !== '1',
  });
  console.log(`pages ${res.pages}, requisitions ${res.requisitions}, lines ${res.lines}`);

  if (generated) {
    fs.mkdirSync(cfg.dataDir, { recursive: true });
    const file = path.join(cfg.dataDir, 'admin-password.txt');
    fs.writeFileSync(file, `${email}\n${password}\n`, { mode: 0o600 });
    console.log(`Admin login: ${email}`);
    console.log(`Temporary password (shown once, also saved to ${file}): ${password}`);
  } else {
    console.log(`Admin login: ${email}`);
  }
  await db.close();
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
