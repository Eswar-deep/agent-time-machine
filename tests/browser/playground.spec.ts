import { expect, test } from '@playwright/test';
import type { Run } from '../../src/types';

test('runs the deterministic demo and requests one live run for the same scenario', async ({ page }) => {
  const modes: string[] = [];
  let demo: Run | undefined;
  await page.route('**/api/health', async route => {
    const health = await (await route.fetch()).json();
    await route.fulfill({ json: { ...health, meta: { ...health.meta, available: true, max_calls: 5, blockers: [] } } });
  });
  await page.route('**/api/runs', async route => {
    if (route.request().method() !== 'POST') return route.continue();

    const body = route.request().postDataJSON();
    expect(body.scenario_id).toBe('coding-date-parser');
    modes.push(body.mode);
    if (body.mode === 'deterministic_demo') {
      const response = await route.fetch();
      expect(response.status()).toBe(201);
      demo = await response.json() as Run;
      expect(demo.usage.calls).toBe(0);
      return route.fulfill({ response });
    }

    // Exercise the browser request and result rendering without spending Meta credits.
    expect(body.mode).toBe('live_meta');
    expect(demo).toBeDefined();
    return route.fulfill({ status: 201, json: { ...demo, mode: 'live_meta', injected_failure: false,
      usage: { ...demo!.usage, calls: 2, total_tokens: 320, cost_usd: 0.0012 } } });
  });

  await page.goto('/');
  await page.getByRole('button', { name: 'Playground', exact: true }).click();
  await page.getByRole('button', { name: 'Compare demo and Meta' }).click();
  const results = page.getByLabel('Comparison results');
  const demoCard = results.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Deterministic demo' }) });
  const liveCard = results.getByRole('article').filter({ has: page.getByRole('heading', { name: 'Live Meta agent' }) });
  await expect(demoCard.getByText('No API calls')).toBeVisible();
  await expect(liveCard.getByText('$0.00120')).toBeVisible();
  expect(modes).toEqual(['deterministic_demo', 'live_meta']);
  await demoCard.getByRole('button', { name: 'Inspect run and checkpoints' }).click();
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toBeVisible();
});
