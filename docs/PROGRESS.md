# Agent Time Machine — implementation state

Updated 2026-11-01.

## Saved progress

The user requested a local savepoint on November 1. Save the implemented offline
MVP and this handoff in the repository's initial commit. The most recent
verification remains the October 31 result below: 34 backend tests, 5 browser
tests, production build, and actual process-restart persistence. No new model
calls or implementation changes were made as part of saving progress.

Runtime databases, installed dependencies, preview screenshots, downloaded source
archives, and local environment files stay outside the commit. Existing run data
remains in the ignored local SQLite database. Live Meta access and the original
validation ZIP remain the next external dependencies.

The requested local environment file is copied from the example with a blank
API key and zero live-call allowance. It is ignored by Git. Repository line
ending attributes preserve the vendored simulator's exact source bytes.

## Authority and scope

Build Agent Time Machine for the Meta hackathon, per the attached implementation
handoff. The workspace was empty. Local Python + React/TypeScript; no deployment
target has been chosen. No paid model calls are authorized or configured.

## Evidence and dependencies

- The validation ZIP is not attached. Its authenticated ChatGPT Library link
  could not be fetched. Its README, REPORT, THIRD_PARTY, and research harness
  have therefore **not** been inspected or reproduced.
- Retrieved upstream tau2-bench at the exact supplied commit
  `122e2432b82d740e8f313f46f0a071729c404f39`.
- Vendor only the retail tools, models, and their support modules, with license
  and source hashes. Use custom, synthetic retail fixtures; no benchmark gold
  data or unrestricted filesystem tool is available to the agent.
- Python 3.11 is available in the geo-hunt conda environment. The full upstream
  benchmark requires Python 3.12; this app uses only its vendored retail subset.
- No Meta key, selected account model, or live call allowance is configured.

## Plan

1. Import unchanged pinned retail tool behavior and run a custom fixture.
2. Persist runs/events and complete checkpoints in SQLite.
3. Implement isolated manual branches, full read/write replay, and scoped checks.
4. Build the local debugger UI and verify the complete user journey.
5. Add a bounded, opt-in Meta adapter and reviewed patch proposals.
6. Exercise corruption, isolation, fresh continuation, errors, persistence, and
   evaluation separation. Document actual outcomes and remaining gates here.

## Implemented and verified

The offline replay-slice gate is met using the pinned real retail tools and three
custom, synthetic development scenarios:

- SQLite runs, checkpoints, event history, JSON exports, and application restart
  persistence. Saved runs are immutable; parents and siblings remain independent.
- Manual intervention before any supported tool execution, fresh deterministic
  continuation, actual state differences, and parent hash comparison.
- Replay of all reads and writes, with observation comparison, final-state
  comparison, and explicit handling of reproduced errors.
- Complete state for the supported agent: environment, conversation prefix,
  pending action, cursor, model/configuration/bounds, schema/source/policy/runtime
  fingerprints, lineage, boundary, and declared randomness behavior.
- React/TypeScript debugger, saved history, state/context inspector, editor,
  scoped checks, replay view, browser-safe checkpoint exports/import validation,
  responsive desktop/mobile layouts, and readable rejection messages.
- Bounded opt-in Meta adapter and separate reviewed patch proposer. All provider
  attempts, including failed/abandoned proposals, are logged. No response cache
  or automatic retries. Keys remain server-side.
- Startup instructions, locked dependencies, third-party attribution, execution
  contracts, limitations, and a reproducible demo script.

### Observed checks

- `python -m pytest tests -q`: **34 passed**. One upstream Starlette/httpx
  test-client deprecation warning; no failed checks.
- `npm run build`: **passed**, including strict TypeScript checking and the
  Vite production bundle.
- `npm run test:ui`: **5 passed** on installed Edge against the real backend:
  successful manual fork and reload, unchanged replay, saved failed branch,
  valid browser export/incompatible import, mobile branching without overflow.
- Desktop original/branch and mobile screenshots were visually inspected.
- The startup script was exercised and the actual server process restarted.
  An existing successful branch was reopened over HTTP, its checkpoint restored,
  and its parent hash verified unchanged after that restart.
- For all three custom development tasks, the injected original fails the
  implemented task checks and the declared deterministic manual correction
  passes them. This is debugger acceptance evidence, not live recovery accuracy.
- All pre-action boundaries of these fixtures reproduce their recorded tool
  observations and final state. Altered read output is detected even when the
  database matches. Concurrent sibling branches preserve their parent.
- Mocked provider tests cover fresh live-context requests, strict proposal
  validation, proposal review before execution, token accounting, unknown costs,
  timeout/failure persistence, no retries, explicit call bounds, and rejection of
  silently changed live model configuration. These are **not real Meta calls**.

Browser testing exposed and fixed a replay-result panel race and export hashing
across Python/JavaScript integral-number serialization. A reload test setup issue
was also corrected; the final browser suite passes.

### Remaining gates / genuine blockers

1. **Validation ZIP unavailable.** Attach it to inspect the original research
   README, REPORT, THIRD_PARTY, and replay harness. Do not run its acquire script
   or overwrite the saved research results. Prior numerical results remain
   unverified historical evidence, not results of this implementation.
2. **No live Meta run.** Configure MODEL_API_KEY, an account-accessible META_MODEL,
   and an explicit ATM_LIVE_MAX_CALLS allowance. No live calls were made and
   account access remains unverified. Use a fresh live continuation for any
   Meta-proposed intervention; do not claim a successful live repair yet.
3. **No frozen live evaluation.** The three current tasks are development
   fixtures with injected failures. Freeze a separate evaluation set before
   tuning, add comparable retry/restart/intervention budgets and information
   access, and report all failures and proposal costs. No recovery advantage is
   established.
4. **No deployment target selected.** The app runs on loopback with local SQLite.
   It has no production authentication or external effects.

## Resume

Read this file, then [README](../README.md), [demo](DEMO.md), and
[contracts](ARCHITECTURE.md). Use the existing project-local virtual environment
and lockfiles. Run `./scripts/start.ps1` (or `.venv/Scripts/python.exe -m backend`)
after building the UI. Data is in `data/agent-time-machine.sqlite3` by default.
Do not reopen project selection or present the deterministic demo as a model
result. Backend source changes intentionally invalidate old checkpoints; record
a fresh run after changing implementation, policy, schemas, or runtime.

