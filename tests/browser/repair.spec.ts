import { expect, test, type APIRequestContext, type Page, type Route } from '@playwright/test';
import { readFileSync } from 'node:fs';
import type { Action, Proposal, Run } from '../../src/types';

// These tests deliberately MOCK every proposal and provider-bound branch HTTP
// response. The only executed code is the deterministic fixture and an explicitly
// manual correction used to supply real evaluation data to the browser mock.
// They establish UI behavior, never live-model integration or performance.
const correction = JSON.parse(readFileSync(new URL('../../fixtures/date_parser/patches/correct.json', import.meta.url), 'utf8')) as {
  files: Record<string, string>;
};
const action: Action = { tool: 'write_file', arguments: { path: 'timestamp_parser.js', content: correction.files['timestamp_parser.js'] } };
const usage = { calls: 1, total_tokens: 321, known_tokens: 321, cost_usd: null, cost_status: 'unknown', unknown_usage_calls: 0, latency_ms: 1200 };

test.setTimeout(90_000);

async function createDeterministicRun(request: APIRequestContext): Promise<Run> {
  const response = await request.post('/api/runs', { data: { scenario_id: 'coding-date-parser', mode: 'deterministic_demo' } });
  expect(response.status(), await response.text()).toBe(201);
  return response.json() as Promise<Run>;
}

async function openRun(page: Page, id: string) {
  await page.addInitScript(runId => {
    if (!sessionStorage.getItem('atm-mocked-repair-test')) {
      localStorage.setItem('atm-active-run', runId);
      localStorage.setItem('atm-primary-domain', 'coding-v1');
      localStorage.setItem('atm-run-mode', 'deterministic_demo');
      sessionStorage.setItem('atm-mocked-repair-test', 'true');
    }
  }, id);
  await page.goto('/');
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toBeVisible();
}

function mockedProposal(run: Run, checkpointId: string): Proposal {
  const evidence = [...run.events].reverse().find(event => event.tool === 'run_tests')!;
  return { id: 'proposal_mock_ready_ui', run_id: run.id, checkpoint_id: checkpointId, status: 'ready', action,
    evidence_refs: [evidence.id], explanation: 'MOCKED evidence: the changed parser loses the timezone offset even though visible tests pass.',
    expected_improvement: 'MOCKED expectation: accept Z timestamps while preserving the instant for offset inputs.',
    failed_trace_access: true, error: null, elapsed_ms: 1350, usage,
    provenance: { provider: 'Meta', api_surface: 'Chat Completions', model: 'mock-meta-repair-model', endpoint: 'https://api.meta.ai/v1/chat/completions', role: 'repair_proposer' },
    model_calls: [{ id: 'mock_call_ui', model: 'mock-meta-repair-model', role: 'repair_proposer', provider: 'Meta', api_surface: 'Chat Completions',
      status: 'completed', error: null, latency_ms: 1200, cost_usd: null, usage: { total_tokens: 321, prompt_tokens: 200, completion_tokens: 121 },
      generation_config: { model: 'mock-meta-repair-model', reasoning_effort: 'low', max_completion_tokens: 2048, timeout_seconds: 60, max_calls: 12 } }] };
}

async function guardBrowserPosts(page: Page, handle: (route: Route, path: string) => Promise<boolean>) {
  const unexpected: string[] = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === 'POST') {
      if (await handle(route, path)) return;
      unexpected.push(request.url());
      await route.fulfill({ status: 409, json: { detail: 'Unexpected POST blocked by mocked repair browser test; no provider request allowed.' } });
      return;
    }
    if (path === '/api/health') {
      const response = await route.fetch();
      const health = await response.json();
      // Configuration availability is mocked solely to enable the UI control.
      await route.fulfill({ json: { ...health, meta: { ...health.meta, available: true, max_calls: 12, model: 'mock-meta-repair-model' } } });
      return;
    }
    if (await handle(route, path)) return;
    await route.continue();
  });
  return unexpected;
}

test('MOCKED Meta selects another checkpoint and preserves its reviewed patch through isolated branch submission', async ({ page, request }) => {
  const original = await createDeterministicRun(request);
  const inspectedCheckpoint = [...original.checkpoints].reverse().find(item => item.tool === 'run_tests')!;
  const selectedCheckpoint = [...original.checkpoints].reverse().find(item => item.tool === 'write_file')!;
  expect(selectedCheckpoint.id).not.toBe(inspectedCheckpoint.id);
  // This real branch is explicitly manual and deterministic. The UI POST below
  // is fulfilled with this saved result, never forwarded as a live continuation.
  const manualResponse = await request.post('/api/runs/' + original.id + '/branches', { data: {
    checkpoint_id: selectedCheckpoint.id, ...action, continuation: 'deterministic_demo',
  } });
  expect(manualResponse.status(), await manualResponse.text()).toBe(201);
  const manualBranch = await manualResponse.json() as Run;
  expect(manualBranch.patch?.provenance.kind).toBe('manual');
  expect(manualBranch.outcome.status).toBe('passed_checks');
  const proposal = mockedProposal(original, selectedCheckpoint.id);
  const history: Proposal[] = [];
  let analysisBody: unknown;
  let forkBody: Record<string, unknown> | null = null;
  let releaseCheckpoint!: () => void;
  const checkpointGate = new Promise<void>(resolve => { releaseCheckpoint = resolve; });
  let announceCheckpoint!: () => void;
  const checkpointRequested = new Promise<void>(resolve => { announceCheckpoint = resolve; });
  const unexpected = await guardBrowserPosts(page, async (route, path) => {
    const method = route.request().method();
    if (path === '/api/runs/' + original.id + '/proposals') {
      if (method === 'POST') { analysisBody = route.request().postDataJSON(); history.unshift(proposal); await route.fulfill({ status: 201, json: proposal }); }
      else await route.fulfill({ json: history });
      return true;
    }
    if (path === '/api/checkpoints/' + selectedCheckpoint.id && method === 'GET' && analysisBody !== undefined) {
      const response = await route.fetch();
      announceCheckpoint(); await checkpointGate;
      await route.fulfill({ response }); return true;
    }
    if (path === '/api/runs/' + original.id + '/branches' && method === 'POST') {
      forkBody = route.request().postDataJSON() as Record<string, unknown>;
      await route.fulfill({ status: 201, json: manualBranch }); return true;
    }
    return false;
  });
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  await openRun(page, original.id);
  await page.getByRole('button', { name: 'Inspect checkpoint before run_tests', exact: true }).last().click();
  await expect(page.getByRole('tab', { name: 'Result', exact: true })).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.result-content').getByText('Exit 0', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Analyze with Meta', exact: false }).click();
  await checkpointRequested;
  expect(analysisBody).toEqual({}); // The model selects; the UI sends no chosen checkpoint.
  await expect(page.getByRole('heading', { name: 'Meta repair review', exact: true })).toBeVisible();
  await expect(page.locator('.repair-explanation').first()).toContainText('MOCKED evidence');
  await expect(page.locator('.repair-explanation').last()).toContainText(proposal.expected_improvement!);
  await expect(page.locator('.repair-model')).toContainText('Meta · mock-meta-repair-model');
  await expect(page.locator('.repair-model')).toContainText('repair proposer · Chat Completions');
  await expect(page.locator('.repair-metrics')).toContainText('321 tokens');
  await expect(page.locator('.repair-metrics')).toContainText('Cost unknown');
  await expect(page.locator('.repair-boundary')).toContainText(selectedCheckpoint.id);
  await expect(page.locator('.repair-evidence-item')).toContainText(proposal.evidence_refs![0]);
  await expect(page.locator('.repair-source-pair > section').last().locator('pre')).toHaveText(correction.files['timestamp_parser.js']);
  await expect(page.getByRole('button', { name: 'Fork & execute proposal', exact: true })).toBeDisabled();
  releaseCheckpoint();
  await expect(page.getByRole('button', { name: 'Fork & execute proposal', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Review in editor', exact: true }).click();
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toHaveText(correction.files['timestamp_parser.js'], { useInnerText: true });
  await page.locator('.intervention-options > summary').click();
  await expect(page.getByLabel('Continue with', { exact: true })).toHaveValue('live_meta');
  await expect(page.getByLabel('Continue with', { exact: true })).toBeDisabled();
  await page.getByRole('tab', { name: /^Meta repair/ }).click();
  await expect(page.getByRole('button', { name: 'Fork & execute proposal', exact: true })).toBeEnabled();
  await page.getByRole('button', { name: 'Fork & execute proposal', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Compare the timelines', exact: true })).toBeVisible();
  expect(forkBody).toEqual({ checkpoint_id: selectedCheckpoint.id, ...action, continuation: 'live_meta', proposal_id: proposal.id });
  expect(unexpected).toEqual([]);
  expect(errors).toEqual([]);
  expect(await (await request.get('/api/runs/' + original.id)).json()).toEqual(original);
});

test('MOCKED invalid and insufficient proposals remain visible and reopen from saved history after reload', async ({ page, request }) => {
  const original = await createDeterministicRun(request);
  const source = mockedProposal(original, original.checkpoints.at(-1)!.id);
  const failed: Proposal = { ...source, id: 'proposal_mock_invalid_ui', checkpoint_id: null, status: 'failed', action: null,
    explanation: null, evidence_refs: [], expected_improvement: null, error: 'MOCKED invalid proposal: selected checkpoint is not supported.' };
  const insufficient: Proposal = { ...source, id: 'proposal_mock_insufficient_ui', checkpoint_id: null, status: 'insufficient_evidence', action: null,
    explanation: 'MOCKED analysis: the observed trace does not establish a safe targeted correction.', expected_improvement: null, error: null };
  const history = [failed, insufficient];
  const unexpected = await guardBrowserPosts(page, async (route, path) => {
    if (path === '/api/runs/' + original.id + '/proposals' && route.request().method() === 'GET') {
      await route.fulfill({ json: history }); return true;
    }
    return false;
  });
  await openRun(page, original.id);
  await page.getByRole('tab', { name: /^Meta repair/ }).click();
  await expect(page.locator('.repair-history > button')).toHaveCount(2);
  await page.locator('.repair-history').getByRole('button', { name: /Proposal failed/ }).click();
  await expect(page.locator('.repair-scroll').getByRole('alert')).toContainText(failed.error!);
  await expect(page.getByRole('button', { name: 'Fork & execute proposal', exact: true })).toHaveCount(0);
  await page.reload();
  await expect(page.getByRole('textbox', { name: 'Source content', exact: true })).toBeVisible();
  await page.getByRole('tab', { name: /^Meta repair/ }).click();
  await expect(page.locator('.repair-history > button')).toHaveCount(2);
  await page.locator('.repair-history').getByRole('button', { name: /Insufficient evidence/ }).click();
  await expect(page.locator('.repair-heading')).toContainText('Insufficient evidence');
  await expect(page.locator('.repair-explanation').first()).toContainText(insufficient.explanation!);
  await expect(page.locator('.repair-metrics')).toContainText('Cost unknown');
  await expect(page.getByRole('button', { name: 'Fork & execute proposal', exact: true })).toHaveCount(0);
  await page.locator('.repair-history').getByRole('button', { name: /Proposal failed/ }).click();
  await expect(page.locator('.repair-scroll').getByRole('alert')).toContainText(failed.error!);
  expect(unexpected).toEqual([]);
});
