import { test, expect } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

const HEADER =
  'Req #,Request Date,Crew,Requester,PB,Line,Part #,Part Name,Part As Written,Qty As Written,Qty Requested,Qty Issued,Pack Qty,Pack Unit,Date Required,Issue Status,Verified,Confidence,Flags,Notes,Source,Scan Page';

test('seeded app: sign in, tracker, matrix, upload, post, export', async ({ page }) => {
  // 1. Sign in. The dashboard shows the backlog numbers.
  await page.goto('/login');
  await page.getByLabel('Email').fill('admin@local.test');
  await page.getByLabel('Password').fill('LocalTest#12345');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('link', { name: /Backlog to verify/ })).toContainText('140');
  await expect(page.getByRole('link', { name: /Lines pending issue/ })).toContainText('58');

  // 2. Tracker filtered to the MIBS crew shows 108 lines.
  await page.goto('/tracker');
  await page.getByLabel('Crew', { exact: true }).selectOption('MIBS');
  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText('108 lines')).toBeVisible();
  await expect(page.getByText('Requested 468,104')).toBeVisible();

  // 3. Matrix shows the amber x2 cell in the PB 37 row.
  await page.goto('/matrix');
  const row37 = page.locator('tr', { has: page.locator('th[scope="row"]', { hasText: /^37$/ }) });
  const cell = row37.locator('td', { has: page.getByTitle('PB 37, 25233-00') });
  await expect(cell).toContainText('440');
  await expect(cell).toContainText('x2');

  // 4. Inbox: upload a scan, wait for To verify, open it, mark it as a duplicate of MFR-000135.
  await page.goto('/inbox');
  await page.locator('#scan-files').setInputFiles(path.resolve('seed/pages/B-001.jpg'));
  await expect(page.getByRole('list', { name: 'Upload progress' }).getByText('Ready to verify', { exact: true })).toBeVisible({ timeout: 60_000 });
  await page.goto('/inbox?tab=review');
  await page.getByRole('link', { name: 'Verify', exact: true }).click();
  await expect(page.getByLabel('Each-count, line 1')).toHaveValue('596');
  await expect(page.getByLabel('Each-count, line 2')).toHaveValue('149');
  await expect(page.getByRole('alert').filter({ hasText: 'MFR-000135' })).toBeVisible();
  await page.getByRole('button', { name: 'Mark duplicate of MFR-000135' }).click();
  await page.waitForURL('**/inbox**');
  await page.goto('/inbox?tab=duplicates');
  const card = page.locator('li', { hasText: 'B-001.jpg' });
  await expect(card).toContainText('MFR-000135');

  // 5. New requisition: MISC TUBES, PB 110, 2 Pallets, issued.
  await page.goto('/requisitions/new');
  await page.getByLabel('Crew', { exact: true }).selectOption({ label: 'MISC TUBES' });
  await page.getByLabel('PB location').fill('110');
  await page.getByLabel('Quantity as written, line 1').fill('2 Pallets');
  await expect(page.getByLabel('Each-count, line 1')).toHaveValue('7680');
  await page.getByLabel('Issued, line 1', { exact: true }).check();
  await page.getByRole('button', { name: /^Post/ }).click();
  await expect(page.getByRole('heading', { name: 'MFR-000141' })).toBeVisible();
  await expect(page.getByLabel('Each-count, line 1')).toHaveValue('7680');
  await expect(page.getByText('7,680').first()).toBeVisible();

  // 6. Tracker search shows one line with issued 7,680.
  await page.goto('/tracker?q=MFR-000141');
  await expect(page.getByText('1 lines')).toBeVisible();
  const line = page.locator('tbody tr', { hasText: 'MFR-000141' });
  await expect(line).toHaveCount(1);
  await expect(line).toContainText('7,680');
  await expect(page.getByText('Issued 7,680')).toBeVisible();

  // 7. CSV export: the first line is the contract header.
  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('link', { name: 'Export CSV' }).click()]);
  const text = fs.readFileSync((await download.path()) as string, 'utf8');
  expect(text.charCodeAt(0)).toBe(0xfeff);
  expect(text.slice(1).split('\r\n')[0]).toBe(HEADER);
  expect(text.split('\r\n').filter(Boolean)).toHaveLength(2);
});
