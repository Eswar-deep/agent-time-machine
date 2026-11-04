import { expect, test } from '@playwright/test';
import { createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';

test.beforeEach(async ({ page, request }) => {
  const response = await request.post('/api/runs', { data: { scenario_id: 'cancel-order' } });
  expect(response.status()).toBe(201);
  const run = await response.json();
  await page.addInitScript(id => {
    if (!sessionStorage.getItem('atm-test-initialized')) {
      localStorage.setItem('atm-active-run', id);
      localStorage.setItem('atm-primary-domain', 'coding-v1');
      sessionStorage.setItem('atm-test-initialized', 'true');
    }
  }, run.id);
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Checkpoint 05 Verified' })).toBeVisible();
});

test('forks a real correction and preserves the original after reload', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const parentId = await page.evaluate(() => localStorage.getItem('atm-active-run'));
  const original = await (await request.get('/api/runs/' + parentId)).json();
  await expect(page.getByText('Edit an argument to explore an alternative', { exact: true })).toBeVisible();
  mkdirSync('.local', { recursive: true });
  await page.screenshot({ path: '.local/debugger-original.png', fullPage: true });
  await page.getByRole('textbox', { name: 'Tool arguments JSON' }).fill(JSON.stringify({
    order_id: '#W1048201', reason: 'no longer needed',
  }, null, 2));
  await expect(page.getByText('Intervention ready · action changed')).toBeVisible();
  await page.getByRole('button', { name: 'Fork & execute' }).click();
  await expect(page.getByRole('heading', { name: 'Compare the timelines' })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Compare/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('textbox', { name: 'Tool arguments JSON' })).toHaveCount(0);
  await expect(page.getByText('Parent verified unchanged')).toBeVisible();
  await expect(page.locator('.metrics').getByText('Passed implemented checks')).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Compare/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Tool arguments JSON' })).toHaveValue(JSON.stringify({
    order_id: '#W1048201', reason: 'no longer needed',
  }, null, 2));
  const branchId = await page.evaluate(() => localStorage.getItem('atm-active-run'));
  expect(branchId).not.toBe(parentId);
  expect(await (await request.get('/api/runs/' + parentId)).json()).toEqual(original);
  await page.screenshot({ path: '.local/debugger-branch.png', fullPage: true });
  await page.reload();
  await expect(page.getByText('Parent verified unchanged')).toBeVisible();
  await expect(page.locator('.metrics').getByText('Passed implemented checks')).toBeVisible();
  await page.getByRole('button', { name: 'Run history', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Saved runs' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('unchanged replay is labeled separately from task success', async ({ page }) => {
  await page.getByRole('button', { name: 'Replay unchanged', exact: true }).click();
  await expect(page.getByRole('tab', { name: /^Results/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByText('The recorded tool sequence reproduced its observations and state.')).toBeVisible();
  await expect(page.getByText('This is a tool replay. Open its parent run to fork a decision.')).toBeVisible();
  await expect(page.getByText('Task success is not evaluated by this replay. Displayed agent messages are saved playback.')).toBeVisible();
  await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
  await expect(page.getByText('This is a tool replay. Open its parent run to fork a decision.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Fork & execute' })).toBeDisabled();
});

test('a failed tool branch is explicit and saved', async ({ page }) => {
  await page.getByRole('textbox', { name: 'Tool arguments JSON' }).fill(JSON.stringify({
    order_id: '#MISSING', reason: 'no longer needed',
  }));
  await page.getByRole('button', { name: 'Fork & execute' }).click();
  await expect(page.getByText('Execution stopped', { exact: true })).toBeVisible();
  await expect(page.locator('.metrics').getByText('Failed checks')).toBeVisible();
  await expect(page.getByText('Parent verified unchanged')).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Compare/ })).toHaveAttribute('aria-selected', 'true');
});

test('browser-exported checkpoints validate and incompatible versions give readable errors', async ({ page, request }) => {
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export selected checkpoint' }).click();
  const file = await downloadEvent;
  const stream = await file.createReadStream();
  const chunks = [];
  for await (const chunk of stream!) chunks.push(chunk);
  const contents = Buffer.concat(chunks);
  const validation = await request.post('/api/checkpoints/validate', { data: { checkpoint: JSON.parse(contents.toString()) } });
  expect(validation.status()).toBe(200);
  const cp = JSON.parse(contents.toString());
  cp.payload.format_version = 999;
  const sorted = JSON.stringify(cp.payload, (_key, value) =>
    value && typeof value === 'object' && !Array.isArray(value) ?
      Object.fromEntries(Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0)) : value);
  cp.sha256 = createHash('sha256').update(sorted).digest('hex');
  await page.getByLabel('Import checkpoint for validation').setInputFiles({
    name: 'incompatible.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(cp)),
  });
  await expect(page.getByRole('alert')).toContainText('Unsupported checkpoint format');
});

test('mobile layout fits the viewport and still executes a branch', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.getByRole('textbox', { name: 'Tool arguments JSON' }).fill(JSON.stringify({
    order_id: '#W1048201', reason: 'no longer needed',
  }));
  await page.getByRole('button', { name: 'Fork & execute' }).click();
  await expect(page.getByText('Parent verified unchanged')).toBeVisible();
  mkdirSync('.local', { recursive: true });
  await page.screenshot({ path: '.local/debugger-mobile.png', fullPage: true });
});

