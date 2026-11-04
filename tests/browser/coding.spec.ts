import { expect, test, type APIRequestContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Checkpoint, CommandResult, Run } from '../../src/types';

// This known alternative is supplied only by the test; the application must not
// embed it or substitute it for an actual manual/model intervention.
const correction = JSON.parse(readFileSync(new URL('../../fixtures/date_parser/patches/correct.json', import.meta.url), 'utf8')) as {
  files: Record<string, string>;
};

test.setTimeout(90_000);

async function createRun(request: APIRequestContext, scenario = 'coding-date-parser'): Promise<Run> {
  const response = await request.post('/api/runs', { data: { scenario_id: scenario, mode: 'deterministic_demo' } });
  expect(response.status(), await response.text()).toBe(201);
  return await response.json() as Run;
}

async function openRun(page: Page, id: string) {
  await page.addInitScript(runId => {
    if (!sessionStorage.getItem('atm-coding-test-initialized')) {
      localStorage.setItem('atm-active-run', runId);
      localStorage.setItem('atm-primary-domain', 'coding-v1');
      sessionStorage.setItem('atm-coding-test-initialized', 'true');
    }
  }, id);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toBeVisible();
}

function visibleCommands(run: Run): CommandResult[] {
  return run.events.filter(event => event.kind === 'tool' && event.tool === 'run_tests')
    .map(event => event.observation?.value as CommandResult);
}

test('rewinds an injected regression, edits source, and verifies the alternative without changing the parent', async ({ page, request }) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const original = await createRun(request);
  expect(original.domain).toBe('coding');
  expect(original.outcome.status).toBe('failed');
  const commands = visibleCommands(original);
  expect(commands[0].exit_code).not.toBe(0); // The reported bug is reproduced before the edit.
  expect(commands.at(-1)?.exit_code).toBe(0); // A green visible suite misses the injected regression.
  expect(original.verification?.checks.some(check => check.group === 'reported_bug' && check.status === 'passed')).toBe(true);
  expect(original.verification?.checks.some(check => check.group === 'regression' && check.status === 'failed')).toBe(true);

  const edit = [...original.checkpoints].reverse().find(checkpoint => checkpoint.tool === 'write_file')!;
  const checkpoint = await (await request.get('/api/checkpoints/' + edit.id)).json() as Checkpoint;
  await openRun(page, original.id);
  await expect(page.getByRole('textbox', { name: 'File path', exact: true })).toHaveValue('timestamp_parser.js');
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toHaveText(String(checkpoint.payload.pending_action.arguments.content), { useInnerText: true });
  await expect(page.getByRole('tab', { name: 'Inspect', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.metrics').getByText('Failed checks')).toBeVisible();

  await page.getByRole('tab', { name: 'State', exact: true }).click();
  await page.locator('.state-content').getByText('timestamp_parser.js', { exact: true }).click();
  expect('files' in checkpoint.payload.environment).toBe(true);
  if ('files' in checkpoint.payload.environment) {
    await expect(page.locator('.source-file[open] pre')).toHaveText(checkpoint.payload.environment.files['timestamp_parser.js']);
  }

  await page.getByRole('button', { name: 'Inspect checkpoint before run_tests', exact: true }).last().click();
  await expect(page.getByRole('tab', { name: 'Inspect', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Result', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.result-content').getByText('Exit 0', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Command output stdout', { exact: true })).toHaveText(commands.at(-1)!.stdout);

  await page.getByRole('button', { name: 'Inspect checkpoint before write_file', exact: true }).last().click();
  await page.getByRole('textbox', { name: 'Source content', exact: true }).fill(correction.files['timestamp_parser.js']);
  await expect(page.getByText('Intervention ready · action changed', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Inspect checkpoint before run_tests', exact: true }).last().click();
  await expect(page.getByRole('tab', { name: 'Result', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Inspect checkpoint before write_file', exact: true }).last().click();
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toHaveText(correction.files['timestamp_parser.js'], { useInnerText: true });
  await page.getByRole('button', { name: 'Fork & execute', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compare the timelines', exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: /^Compare/ })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Code changes', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.comparison-checks')).toHaveCount(0);
  await expect(page.locator('.metrics').getByText('Passed implemented checks')).toBeVisible();
  await expect(page.getByText('Parent verified unchanged', { exact: true })).toBeVisible();

  const branchId = await page.evaluate(() => localStorage.getItem('atm-active-run'));
  expect(branchId).not.toBe(original.id);
  const branch = await (await request.get('/api/runs/' + branchId)).json() as Run;
  expect(branch.patch?.provenance.kind).toBe('manual');
  expect(branch.verification?.tamper_detected).toBe(false);
  expect(branch.verification?.command?.exit_code).toBe(0);
  expect(branch.outcome.checks.every(check => check.status === 'passed')).toBe(true);
  expect(await (await request.get('/api/runs/' + original.id)).json()).toEqual(original);
  await expect(page.getByRole('heading', { name: /^Original patch/ })).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Alternative patch/ })).toBeVisible();
  await expect(page.locator('.code-comparison > section').nth(1).locator('.source-diff')).toContainText('@@');
  await page.getByRole('tab', { name: 'Test results', exact: true }).click();
  await expect(page.getByRole('tab', { name: 'Test results', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.code-comparison')).toHaveCount(0);
  const branchChecks = page.locator('.comparison-checks > div').nth(1);
  const passedRegressions = branch.outcome.checks.filter(check => check.group === 'regression' && check.status === 'passed');
  await expect(branchChecks.locator('.check-row')).toHaveCount(branch.outcome.checks.length);
  await expect(branchChecks.locator('.passed-regression-checks > summary')).toHaveText(passedRegressions.length + ' passed regression checks');
  await expect(branchChecks.locator('.passed-regression-checks .check-row').first()).not.toBeVisible();
  await branchChecks.locator('.passed-regression-checks > summary').click();
  await expect(branchChecks.locator('.passed-regression-checks .check-row').first()).toBeVisible();
  await page.getByRole('tab', { name: 'Command output', exact: true }).click();
  await expect(page.locator('.comparison-checks')).toHaveCount(0);
  await expect(page.getByLabel('Alternative verification output stdout', { exact: true })).toHaveText(branch.verification!.command!.stdout);
  const alternative = page.locator('.verification-evidence').filter({ has: page.getByRole('heading', { name: 'Alternative verification', exact: true }) });
  await alternative.getByText('Verification provenance', { exact: true }).click();
  await expect(alternative.getByText(branch.verification!.requirements_hash, { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByText('Parent verified unchanged', { exact: true })).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Code changes', exact: true })).toHaveAttribute('aria-selected', 'true');
  expect(await page.evaluate(() => localStorage.getItem('atm-active-run'))).toBe(branchId);
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(errors).toEqual([]);
});

test('an unsuccessful manual alternative remains failed and preserves its original after reload', async ({ page, request }) => {
  const original = await createRun(request);
  const wrongOffsetSource = correction.files['timestamp_parser.js'].replace(
    'local.getTime() - offsetMinutes * 60000', 'local.getTime() + offsetMinutes * 60000');
  expect(wrongOffsetSource).not.toBe(correction.files['timestamp_parser.js']);
  await openRun(page, original.id);
  await page.getByRole('textbox', { name: 'Source content', exact: true }).fill(wrongOffsetSource);
  await page.getByRole('button', { name: 'Fork & execute', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compare the timelines', exact: true })).toBeVisible();
  await expect(page.locator('.metrics').getByText('Failed checks')).toBeVisible();
  await expect(page.getByText('Parent verified unchanged', { exact: true })).toBeVisible();

  const branchId = await page.evaluate(() => localStorage.getItem('atm-active-run'));
  expect(branchId).not.toBe(original.id);
  const branch = await (await request.get('/api/runs/' + branchId)).json() as Run;
  expect(branch.execution).toBe('completed');
  expect(branch.outcome.status).toBe('failed');
  expect(branch.patch?.provenance.kind).toBe('manual');
  expect(branch.verification?.tamper_detected).toBe(false);
  const failedRegressions = branch.outcome.checks.filter(check => check.group === 'regression' && check.status === 'failed');
  expect(failedRegressions.length).toBeGreaterThan(0);
  expect(branch.outcome.checks.find(check => check.group === 'reported_bug')?.status).toBe('passed');
  await page.getByRole('tab', { name: 'Test results', exact: true }).click();
  const branchChecks = page.locator('.comparison-checks > div').nth(1);
  for (const check of failedRegressions) {
    await expect(branchChecks.locator('.check-row').filter({ hasText: check.label })).toBeVisible();
  }
  expect(await (await request.get('/api/runs/' + original.id)).json()).toEqual(original);
  await page.reload();
  await expect(page.locator('.metrics').getByText('Failed checks')).toBeVisible();
  await expect(page.getByText('Parent verified unchanged', { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('atm-active-run'))).toBe(branchId);
  await expect(page.getByRole('tab', { name: /^Compare/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Inspect', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toHaveText(wrongOffsetSource, { useInnerText: true });
  expect(await (await request.get('/api/runs/' + branchId)).json()).toEqual(branch);
});

test('green tampered visible tests remain a failed task under protected verification', async ({ page, request }) => {
  const run = await createRun(request, 'coding-test-tamper');
  const commands = visibleCommands(run);
  expect(commands[0].exit_code).not.toBe(0);
  expect(commands.at(-1)?.exit_code).toBe(0);
  expect(run.verification?.tamper_detected).toBe(true);
  expect(run.verification?.checks.find(check => check.id === 'visible_tests_unchanged')?.status).toBe('failed');
  expect(run.verification?.checks.some(check => check.group === 'reported_bug' && check.status === 'failed')).toBe(true);
  expect(run.outcome.status).toBe('failed');

  await openRun(page, run.id);
  await expect(page.getByRole('textbox', { name: 'File path', exact: true })).toHaveValue('test_timestamp_parser.js');
  await expect(page.locator('.metrics').getByText('Failed checks')).toBeVisible();
  await page.getByRole('tab', { name: /^Results/ }).click();
  await page.getByRole('tab', { name: 'Test results', exact: true }).click();
  await expect(page.getByText('Tampering detected', { exact: true })).toBeVisible();
  const visibleCheck = page.locator('.results-panel .check-row').filter({ hasText: 'Visible tests complete successfully' });
  await expect(visibleCheck.locator('.check-status')).toHaveText('passed');
  const integrityCheck = page.locator('.results-panel .check-row').filter({ hasText: 'Visible tests remain unchanged' });
  await expect(integrityCheck.locator('.check-status')).toHaveText('failed');
  await page.getByRole('tab', { name: 'Command output', exact: true }).click();
  await expect(page.getByLabel('Protected verification output stdout', { exact: true })).toHaveText(run.verification!.command!.stdout);
  await page.getByRole('button', { name: 'Inspect checkpoint before run_tests', exact: true }).last().click();
  await expect(page.getByRole('tab', { name: 'Inspect', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('tab', { name: 'Result', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.result-content').getByText('Exit 0', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Command output stdout', { exact: true })).toHaveText(commands.at(-1)!.stdout);
});

test('source editing supports undo and search while the selected theme survives reload', async ({ page, request }) => {
  const original = await createRun(request);
  const edit = original.checkpoints.find(checkpoint => checkpoint.tool === 'write_file')!;
  const checkpoint = await (await request.get('/api/checkpoints/' + edit.id)).json() as Checkpoint;
  const source = String(checkpoint.payload.pending_action.arguments.content);
  await openRun(page, original.id);
  const editor = page.getByRole('textbox', { name: 'Source content', exact: true });
  await expect(editor).toHaveAttribute('contenteditable', 'true');
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'dark');
  await page.getByRole('button', { name: 'Switch to light theme', exact: true }).click();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.atm-source-editor')).toHaveAttribute('data-theme', 'light');

  await editor.press('Control+Home');
  await page.keyboard.insertText('// keyboard editing check\n');
  await expect(editor).toContainText('// keyboard editing check');
  await editor.press('ControlOrMeta+z');
  await expect(editor).toHaveText(source, { useInnerText: true });
  await editor.press('ControlOrMeta+f');
  const find = page.getByRole('textbox', { name: 'Find', exact: true });
  await expect(find).toBeVisible();
  await find.fill('offsetMinutes');
  await find.press('Enter');
  await expect(page.locator('.cm-searchMatch').first()).toBeVisible();
  await find.press('Escape');
  await expect(find).toHaveCount(0);

  await page.reload();
  await expect(page.locator('.app-shell')).toHaveAttribute('data-theme', 'light');
  await expect(page.locator('.atm-source-editor')).toHaveAttribute('data-theme', 'light');
  await expect(page.getByRole('button', { name: 'Switch to dark theme', exact: true })).toBeVisible();
  await expect(editor).toHaveText(source, { useInnerText: true });
  expect(await page.evaluate(() => localStorage.getItem('atm-theme'))).toBe('light');
});

test('mobile coding workspace keeps source and fork controls usable through a verified repair', async ({ page, request }) => {
  const original = await createRun(request);
  await page.setViewportSize({ width: 390, height: 844 });
  await openRun(page, original.id);
  const editor = page.getByRole('textbox', { name: 'Source content', exact: true });
  const fork = page.getByRole('button', { name: 'Fork & execute', exact: true });
  await expect(editor).toBeVisible();
  await expect(fork).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  const executionActions = page.getByRole('button', { name: 'Execution actions', exact: true });
  await expect(executionActions).toHaveAttribute('aria-expanded', 'false');
  await executionActions.click();
  await expect(executionActions).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name: 'Inspect checkpoint before run_tests', exact: true }).last().click();
  await expect(page.getByRole('tab', { name: 'Result', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(executionActions).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByLabel('Command output stdout', { exact: true })).toHaveText(visibleCommands(original).at(-1)!.stdout);
  await executionActions.click();
  await page.getByRole('button', { name: 'Inspect checkpoint before write_file', exact: true }).last().click();
  await expect(executionActions).toHaveAttribute('aria-expanded', 'false');
  await expect(editor).toBeVisible();
  await editor.fill(correction.files['timestamp_parser.js']);
  await expect(fork).toBeEnabled();
  await fork.click();
  await expect(page.getByText('Parent verified unchanged', { exact: true })).toBeVisible();
  await expect(page.locator('.metrics').getByText('Passed implemented checks')).toBeVisible();
  await expect(page.getByRole('tab', { name: 'Code changes', exact: true })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tab', { name: 'Test results', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Branch checks', exact: true })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  expect(await (await request.get('/api/runs/' + original.id)).json()).toEqual(original);
});

test('upgrades a stored retail selection once and preserves subsequent user selections', async ({ page, request }) => {
  const retail = await createRun(request, 'cancel-order');
  const coding = await createRun(request);
  await page.addInitScript(runId => {
    if (!sessionStorage.getItem('atm-coding-migration-test')) {
      localStorage.setItem('atm-active-run', runId);
      localStorage.removeItem('atm-primary-domain');
      sessionStorage.setItem('atm-coding-migration-test', 'true');
    }
  }, retail.id);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('atm-active-run'))).toBe(coding.id);
  expect(await page.evaluate(() => localStorage.getItem('atm-primary-domain'))).toBe('coding-v1');

  await page.getByRole('button', { name: 'Run history', exact: true }).click();
  await page.locator('.history-table-row').filter({ hasText: retail.id.slice(4, 12) }).click();
  await expect(page.getByRole('textbox', { name: 'Tool arguments JSON', exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Tool arguments JSON', exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('atm-active-run'))).toBe(retail.id);
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toHaveCount(0);
});
