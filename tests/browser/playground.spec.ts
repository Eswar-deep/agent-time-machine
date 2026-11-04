import { expect, test } from '@playwright/test';
import type { Run } from '../../src/types';

test('compares playground outcomes and opens the saved run', async ({ page, request }) => {
  const response = await request.post('/api/runs', { data: { scenario_id: 'coding-date-parser' } });
  expect(response.status(), await response.text()).toBe(201);
  const run: Run = await response.json();

  // Only the playground response and availability are mocked. Opening the
  // trace uses the backend's actual saved fixture run and checkpoints.
  await page.route('**/api/health', async route => {
    const health = await (await route.fetch()).json();
    await route.fulfill({ json: { ...health, meta: { ...health.meta, available: true, max_calls: 5, blockers: [] } } });
  });
  await page.route('**/api/experiments', async route => {
    expect(route.request().postDataJSON()).toEqual({ variant_instruction: 'Use a targeted edit.' });
    const arm = { ...run, tool_calls: 3, blocked_actions: 0,
      supervision: { status: 'completed', rubric: { task_outcome: {
        status: 'fail', reason: 'The regression is still present.', evidence: ['protected-checks'],
      } } } };
    await route.fulfill({ status: 201, json: { id: 'mocked-experiment', baseline: arm, variant: { ...arm, blocked_actions: 1 } } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.getByRole('textbox', { name: 'Variant instruction' }).fill('Use a targeted edit.');
  await page.getByRole('button', { name: 'Run experiment' }).click();
  const results = page.getByLabel('Experiment results');
  await expect(results.getByRole('heading', { name: 'Baseline' })).toBeVisible();
  await expect(results.getByRole('heading', { name: 'Variant' })).toBeVisible();
  await expect(results.getByText('Evidence: protected-checks')).toHaveCount(2);
  await results.getByRole('button', { name: 'Inspect run and checkpoints' }).first().click();
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toBeVisible();
});
