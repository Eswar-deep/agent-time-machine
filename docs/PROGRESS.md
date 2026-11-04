# Agent Time Machine — implementation state

Updated 2026-11-03.

## Current implementation: coding-agent demo

Agent Time Machine remains the selected project. The primary presentation now
uses the frozen [JavaScript date-parser fixture](../fixtures/date_parser/README.md).
The existing Python/React application, checkpoint architecture, SQLite storage,
Meta adapter, and retail scenarios have been preserved. The historical retail
results below do not validate the new coding environment.

The manual workflow is implemented: record execution, select the checkpoint
before `write_file`, edit the proposed source, execute an independent branch,
and compare actual patches, command output, and frozen acceptance checks.
Coding snapshots contain all candidate files, relevant untracked files and their
tracking metadata, conversation prefix, pending action, execution configuration,
and runtime fingerprints. Parent runs, sibling branches, unsuccessful attempts,
and correction overhead remain recorded.

### Observed coding outcomes

These results came from real candidate execution inside QuickJS WebAssembly.
Expected values were compared in trusted host code, outside the guest.

| Candidate | Visible tests | Protected behavior | Frozen test integrity |
| --- | --- | --- | --- |
| Initial parser | 3/4 | 23/25 | Passed |
| Deliberately injected original patch | 4/4 | 22/25 | Passed |
| Manually supplied alternative | 4/4 | 25/25 | Passed |
| Injected misleading-green test edit | 4/4 | 23/25 | Failed |

The original patch fixes the reported Z-format example but breaks three timezone
offset cases. The manual alternative retains Z support and restores the offset
adjustment. The misleading-green candidate weakens its local assertion without
fixing the parser; protected behavior and the test fingerprint reject it.

The application displays **25/28 implemented checks** for the injected original
and **28/28** for the manual alternative. These totals add frozen test integrity,
the visible test command, and execution/verification completion to the 25
protected behavior cases. Command exit codes and stdout/stderr are recorded;
green local output never overrides protected results. Failed alternatives stay
inspectable. See the current [demonstration script](DEMO.md).

### Execution boundary and evidence

Candidate source runs only in the pinned `quickjs-emscripten@0.32.0` WASM guest.
It has no exposed host filesystem, process, environment, networking, or host
callback capabilities. Runtime memory, stack, execution time, process time, and
output are bounded. A missing runtime fails closed. The separate trusted
verifier owns the frozen expectations and integrity checks; it sends only case
identifiers and inputs into fresh guest runtimes.

Actual isolation tests verified absent host/evaluator globals, a blocked host-file
write with an unchanged sentinel, rejected constructor/import escapes, an
interrupted infinite loop, bounded allocation, and independent state per case.
The fixture is a small synchronous JavaScript repository, not an arbitrary shell
or general build service. The launcher, interpreter/runtime, and verifier remain
trusted components; the runtime is not claimed immune to unknown vulnerabilities.
Details are in [CODING_SANDBOX.md](CODING_SANDBOX.md).

Latest recorded backend validation: **75 tests passed**, including focused coding
restoration, branching, verifier, and actual WASM isolation checks. This was run
after adding provider-error diagnosis, reasoning configuration, token-limit
handling, and progress-note/tool-call compatibility. The latter tests verify that
notes survive checkpoint restoration, future messages remain excluded, and
multiple tool calls are rejected before executing any action. The standalone isolation suite
recorded **11 passing tests**; each 25-case fixture probe took approximately
181-203 ms in the observed local runs, including process startup.

**Latest workbench validation: 11 browser tests passed (32.9 seconds) on November 3.** Coverage
includes the successful manual coding intervention, failed alternatives,
protected tamper rejection, preserved parent data, draft restoration after
inspecting another checkpoint, editor undo/search, persisted theme selection,
mobile action navigation/repair, and the existing retail workflows. After the
last mobile spacing adjustment, both mobile journeys passed again (12.4 seconds).
Strict TypeScript and the Vite production build passed after persisting the
selected execution mode across refreshes and correcting Meta connection copy.
Vite reports a nonblocking
bundle-size warning for the editor-inclusive JavaScript bundle (about 797 kB,
259 kB gzip); splitting it remains a performance follow-up.

### Workbench and UX direction

The interface now uses a dark/light workbench with an execution timeline,
checkpoint inspector, CodeMirror source editor, and separate Inspect and
Results/Compare views. Evidence is organized into Code changes, Test results,
and Command output tabs. Manual draft caching, guarded async navigation,
explicit patch/continuation provenance, and separate next-scenario/current-run
labels support the coding workflow. Screenshot review covered desktop dark/light
themes, split code comparison, checks, and the 390-pixel mobile layout. No page
errors or horizontal mobile page overflow were observed. The mobile trace can be
expanded to select an action, then collapses to expose the editor; fork controls
remain available while editing. The guide traps keyboard focus, and workspace
tabs support arrow-key navigation. The app is built and running locally at
http://127.0.0.1:8000. No live model generation was used for this work.

The layout direction draws on these official references, adapted to this
application rather than copied as a product specification:

- [Playwright Trace Viewer](https://playwright.dev/docs/trace-viewer): select an
  action in a recorded timeline and inspect the associated evidence.
- [VS Code debugging](https://code.visualstudio.com/docs/debugtest/debugging):
  keep execution navigation, source inspection, and debugger state coordinated.
- [GitHub reviewing proposed changes](https://docs.github.com/en/pull-requests/how-tos/review-pull-requests/reviewing-proposed-changes-in-a-pull-request):
  make file diffs and review context easy to inspect before accepting a change.

### Live integration and remaining work

**Live generation is now verified for the coding fixture.** After the user
replaced the key, `muse-spark-1.3` completed local run
`run_b5e9368a2fb14267ab158f88e7f0c479` using 9 real model calls and 8 tool calls.
It reproduced the visible failure (exit 1), generated a parser-only patch,
reran visible tests (exit 0), and passed protected verification (exit 0).
All 28 implemented checks passed, with no test tampering. The run took about
40.6 seconds and used 30,952 measured tokens. Monetary cost remains unknown
because rates are not configured. It is a live repair of the baseline bug,
with `injected_failure=false`; it does not establish a counterfactual recovery
advantage or a general live-agent success rate.

The user set the call allowance to 20; the implemented cap makes the effective
allowance 12 per run. Live settings now use 2,048 output tokens, a 60-second
timeout, and `META_REASONING_EFFORT=low`. Reasoning effort is included in request
identities and checkpoints; changing it rejects silent continuation from an old
live configuration. The model's private reasoning is never requested or stored.
Output-token exhaustion is logged with its finish reason and usage.

Earlier failures are retained. Initial generation failed because the sandboxed
server lacked network access. The backend was restarted outside that network
sandbox, preserving the separate candidate WASM isolation boundary.

Two subsequent live runs reached Meta and returned HTTP 402. A single diagnostic
request, limited to 64 output tokens and recorded with purpose
`connectivity_check`, confirmed `billing_error` / `billing_not_configured` for
the previous key:
"Billing verification failed." The provider supplied a team-specific billing
link. After the key update, a 64-token diagnostic reached HTTP 200 but exhausted
that small output budget. A subsequent coding run hit a connection timeout.
The next request generated a valid progress note and tool call; the app's old
restriction rejected that combination before executing a tool. This bug is now
fixed: observable progress notes are retained before the checkpoint, and one
tool action is executed normally. Multiple simultaneous tools remain unsupported.
There were 16 recorded attempts at this validation point, including all failures
and the 9-call successful run. There are no automatic retries. Missing usage or
monetary cost is never represented as zero.

The adapter now retains bounded provider type/code/message and HTTP status,
redacts configured credentials, and gives an actionable error. It does not store
raw error bodies or response headers. The current key now permits generation.
The adapter and reviewed proposals remain available for coding, with fresh
continuation from checkpoint context. Live proposal generation and a full live
counterfactual branch have not yet been separately verified; mock-provider
checks are not live Meta results.

The scripted injected failures and manual alternatives establish the implemented
fixture workflow only. They do not establish a live model recovery rate, a
recovery advantage, a unique causal explanation, or general repository rollback.
Model calls remain zero for the scripted/manual demonstrations. Preserve distinctions
between injected, manual, recorded-playback, and live-generated artifacts.

Workbench build/browser/visual validation is recorded above. The unavailable
historical validation ZIP and lack of a deployment
target remain unchanged. The optional research-agent search comparison is not
part of the completed coding demo, and no public web rewind is claimed.

## Historical record: October 31-November 1

The sections below preserve the earlier retail implementation and savepoint
history. Their test totals, plan, and blockers describe that earlier stage;
use the November 2 status above for the current coding-demo scope.

### Saved progress

The user requested a local savepoint on November 1. Save the implemented offline
MVP and this handoff in the repository's initial commit. The most recent
verification remains the October 31 result below: 34 backend tests, 5 browser
tests, production build, and actual process-restart persistence. No new model
calls or implementation changes were made as part of saving progress.

Runtime databases, installed dependencies, preview screenshots, downloaded source
archives, and local environment files stay outside the commit. Existing run data
remains in the ignored local SQLite database. Live Meta access and the original
validation ZIP remain the next external dependencies.

The requested local environment file was copied from the example and is ignored
by Git. The user added a key on November 1. An authenticated GET to Meta's model
catalog returned HTTP 200 and listed the configured muse-spark-1.3 model. No
generation request was made; ATM_LIVE_MAX_CALLS remains zero pending the user's
test-limit choice. Repository line ending attributes preserve the vendored
simulator's exact source bytes.

### Authority and scope

Build Agent Time Machine for the Meta hackathon, per the attached implementation
handoff. The workspace was empty. Local Python + React/TypeScript; no deployment
target has been chosen. No paid model calls are authorized or configured.

### Evidence and dependencies

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
- The Meta key is now configured. The authenticated model catalog lists the
  selected muse-spark-1.3 model. Generation access/quota remains untested, and
  live generation stays disabled by the zero call allowance.

### Plan

1. Import unchanged pinned retail tool behavior and run a custom fixture.
2. Persist runs/events and complete checkpoints in SQLite.
3. Implement isolated manual branches, full read/write replay, and scoped checks.
4. Build the local debugger UI and verify the complete user journey.
5. Add a bounded, opt-in Meta adapter and reviewed patch proposals.
6. Exercise corruption, isolation, fresh continuation, errors, persistence, and
   evaluation separation. Document actual outcomes and remaining gates here.

### Implemented and verified

#### Interface refresh — November 1

Redesigned the debugger with a light neutral workspace, restrained violet
accents, readable type, clearer cards, and a dark JSON editor. The fork action
now sits in the inspector header. Mobile uses a compact top navigation and
places the inspector before the timeline, with shorter summary cards.

Added a dedicated Result tab for the actual recorded tool observation; its
post-checkpoint timing and exclusion from restored context remain explicit.
Noninteractive timeline messages are now articles rather than disabled buttons.
The execution backend and checkpoint format were not changed.

Verification: strict TypeScript/Vite production build passed; all five existing
browser journeys passed against the real backend. The mobile branching test was
re-run and passed after the final compact-card adjustment. Desktop and mobile
screenshots were inspected, and the new Result tab was checked in the shared
browser. No live model generation was used for this redesign.

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

#### Observed checks

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

#### Remaining gates / genuine blockers

1. **Validation ZIP unavailable.** Attach it to inspect the original research
   README, REPORT, THIRD_PARTY, and replay harness. Do not run its acquire script
   or overwrite the saved research results. Prior numerical results remain
   unverified historical evidence, not results of this implementation.
2. **No live Meta run.** The key authenticated and the selected model appeared
   in the catalog on November 1. The remaining gate is an explicit
   ATM_LIVE_MAX_CALLS allowance, currently zero; the user has been asked to
   choose a limit. No generation calls were made. Use a fresh live continuation
   for any Meta-proposed intervention; do not claim a successful live repair yet.
3. **No frozen live evaluation.** The three current tasks are development
   fixtures with injected failures. Freeze a separate evaluation set before
   tuning, add comparable retry/restart/intervention budgets and information
   access, and report all failures and proposal costs. No recovery advantage is
   established.
4. **No deployment target selected.** The app runs on loopback with local SQLite.
   It has no production authentication or external effects.

### Resume

Read this file, then [README](../README.md), [demo](DEMO.md), and
[contracts](ARCHITECTURE.md). Use the existing project-local virtual environment
and lockfiles. Run `./scripts/start.ps1` (or `.venv/Scripts/python.exe -m backend`)
after building the UI. Data is in `data/agent-time-machine.sqlite3` by default.
Do not reopen project selection or present the deterministic demo as a model
result. Backend source changes intentionally invalidate old checkpoints; record
a fresh run after changing implementation, policy, schemas, or runtime.
# Publication documentation — November 3, 2026

The current project name is **Agent Time Machine**, with the requested local
folder and GitHub slug `agent-time-machine`. The README now targets a fresh
clone, with separate setup, API, validation, and troubleshooting guides.

The interactive misleading-test walkthrough reproduced a failed manual branch
(20/28) caused by an omitted return statement. A new manual branch restored the
return and passed 28/28, with protected Exit 0 and no tampering. Full HTTP-record
hashes confirmed that its failed parent and injected ancestor stayed unchanged.
The demo guide now distinguishes visible commands, protected evaluation, and
inherited historical failures, and includes the complete final calculation.

Latest recorded implementation checks are 75 backend tests, 11 browser tests,
and the production build, all passing. This documentation update introduces no
new model calls. [Validation](VALIDATION.md) separates those checks from the one
verified live Meta repair and from claims not yet established. Earlier dated
notes are historical; their blockers can be superseded by later work.

