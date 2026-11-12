// Prepares a clean local database for the smoke test: removes .data-e2e and runs the seed.
// Playwright starts its web server before it runs globalSetup, and the server opens the embedded
// database lazily, so this file is also run as a script ahead of the server (see playwright.config.ts).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';

export const E2E_ENV = {
  DATA_DIR: '.data-e2e',
  AI_MODE: 'mock',
  ADMIN_EMAIL: 'admin@local.test',
  ADMIN_NAME: 'Site Admin',
  ADMIN_PASSWORD: 'LocalTest#12345',
  SEED_SKIP_PASSWORD_CHANGE: '1',
};

export default function globalSetup(): void {
  fs.rmSync(E2E_ENV.DATA_DIR, { recursive: true, force: true });
  execFileSync('npx', ['tsx', 'scripts/seed.ts'], { stdio: 'inherit', env: { ...process.env, ...E2E_ENV } });
}

// Run directly: `tsx tests/e2e/global-setup.ts`.
if (process.argv[1] && process.argv[1].endsWith('global-setup.ts')) globalSetup();
