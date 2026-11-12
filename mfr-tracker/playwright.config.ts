import fs from 'node:fs';
import { defineConfig } from '@playwright/test';
import { E2E_ENV } from './tests/e2e/global-setup';

const port = Number(process.env.E2E_PORT ?? 3100);
// Cloud sandboxes ship one preinstalled Chromium; use it when it is there, otherwise Playwright's own download.
const sandboxChromium = '/opt/pw-browsers/chromium';
const executablePath = process.env.PW_CHROMIUM_PATH ?? (fs.existsSync(sandboxChromium) ? sandboxChromium : undefined);

export default defineConfig({
  testDir: 'tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 120_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${port}`,
    trace: 'off',
    acceptDownloads: true,
    launchOptions: executablePath ? { executablePath, args: ['--no-sandbox'] } : {},
  },
  webServer: {
    // Clean database and seed first, then build and serve. The server opens the database lazily, after the seed is done.
    command: `npx tsx tests/e2e/global-setup.ts && npm run build && npm run start -- -p ${port}`,
    url: `http://localhost:${port}/login`,
    timeout: 300_000,
    reuseExistingServer: false,
    env: { ...(process.env as Record<string, string>), ...E2E_ENV },
  },
});
