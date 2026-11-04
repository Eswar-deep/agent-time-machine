# Validation evidence

[README](../README.md) · [Demo](DEMO.md) · [Sandbox](CODING_SANDBOX.md)

These are development acceptance results, not a held-out benchmark or measured
recovery advantage. Local records are in an ignored SQLite database. A fresh
clone must execute scenarios to create its own evidence.

## Recorded checks — November 3, 2026

| Check | Observed result |
|---|---|
| Backend pytest | 109 passed; one upstream Starlette/httpx deprecation warning |
| Browser journeys using Edge | Existing 11 passed plus two new mocked-proposal journeys passed; 13 total |
| TypeScript/Vite build | Passed; nonblocking bundle-size warning |

Coverage includes additions, edits, deletions and untracked metadata, dirty
snapshot restoration, context/configuration restoration,
immutable parents/siblings, failed alternatives, tampering, replay, exports,
provider errors/redaction (including object keys and redacted-name collisions),
tool validation, source editing, and mobile layout.
Actual WASM checks cover absent host capabilities, rejected escape attempts,
bounded loops/allocation, and fresh contexts per case. See [sandbox](CODING_SANDBOX.md).

New repair coverage checks strict schema/reference/checkpoint/action validation,
insufficient evidence and provider failure records, prompt exclusion of protected
definitions/answers/diagnostics, proposal history/retrieval, matching reviewed
proposal execution, fresh context, restart without advice, usage and redacted
exports. Browser journeys exercise proposal review/execution and failure display
using mocked responses. Model unit tests use mocked HTTP. These automated checks
make no paid calls and are not real-provider repair evidence.

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
npm run build
npm run test:ui
```

Playwright uses Edge by default on Windows. For bundled Chromium, install with
`npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=bundled`.
When port 8000 is free, the suite starts a backend with
`data/browser-tests.sqlite3`. If an app is already running, the suite reuses it
and creates records in its database. Stop the demo server first to use separate
test data.

A clean source archive of executed revision `803c043` completed `npm ci` and a
production build. Using the installed Python lockfile environment, a fresh local
database seeded the injected coding fixture, served the interface, restored a
checkpoint and returned 25/28 with no API credentials or model calls. This checks
source/dependency availability without relying on the original development data.

## Frozen fixture outcomes

There are 25 protected behavior cases plus test integrity, visible-command
success, and execution/verification completion: 28 final checks.

| Candidate | Visible suite | Protected behavior | Test integrity |
|---|---:|---:|---|
| Initial parser | 3/4 | 23/25 | Pass |
| Injected offset regression | 4/4 | 22/25 | Pass |
| Supplied manual correction | 4/4 | 25/25 | Pass |
| Injected weakened test | 4/4 | 23/25 | Fail |

An injected original has visible Exit 0 but only 25/28 final checks. The corrected
manual branch passes 28/28. Passing implemented checks does not prove correctness
for every possible timestamp.

In the interactive misleading-test walkthrough, a manual alternative omitted the
final return statement. It was saved with 20/28 checks and visible Exit 1. A new
branch restored the return and passed 28/28, protected Exit 0, and test integrity.
Full HTTP-record hashes verified that both the injected original and failed
manual attempt stayed unchanged. This is manual intervention with deterministic
continuation. Failed attempts and correction overhead remain visible.

## One verified live original-agent repair

On November 3, 2026, `muse-spark-1.3` completed one original date-parser task:

| Measurement | Recorded value |
|---|---|
| Mode/provenance | `live_meta`; no injected patch |
| Provider/product/API | Direct Meta Model API; Chat Completions |
| Model calls | 9 |
| Tool calls / checkpoints | 8 / 8 |
| Measured tokens | 30,952 |
| Elapsed execution | Approximately 40.6 seconds |
| Visible exits | 1 before its edit; 0 afterward |
| Protected verification | Exit 0; 28/28 overall checks; no tampering |
| Changed candidate files | Parser only |
| Monetary cost | Unknown; token prices not configured |

Earlier billing failures, output truncation, connection timeout, and a request
rejected by the former mixed-text/tool restriction remain recorded separately.
Progress text alongside one tool call is now supported and restored at its
boundary. Multiple tool calls in one turn are rejected before execution.

This proves one live original-agent integration/fixture repair. It does not
establish that a separate Meta repair proposal was connected to a successful
counterfactual branch. Mocked proposal/continuation tests are not additional
real-provider successes.

## Live Meta-proposed recovery evidence

On November 3, Chicago time, an actual Meta request produced a structured repair
proposal that selected the pre-edit checkpoint. Its exact proposed action was
executed unchanged, followed by fresh Meta continuation and real protected
verification. The original was an explicitly injected deterministic regression;
it is not attributed to Meta. The alternative's patch provenance is
`meta_proposal`, while its inherited source-run injection flag preserves that
original provenance.

The [evidence manifest](../evidence/meta-repair-2026-11-03/manifest.json) records
configuration, measurements, integrity checks and SHA-256 hashes for the complete
exports. These are saved results of real requests and executions, not new calls
made when someone opens the files.

| Evidence | Actual record |
|---|---|
| Original | `run_8eb393e4e2b6423fbe7b350d21da64a1`; injected; 25/28; protected Exit 1 |
| Proposal | `proposal_f80f3e9a526e4e26b813867e2ada3364`; ready; four original event references |
| Selected checkpoint | `cp_8634588107184a0daddae404fc25a79a`; before the problematic write |
| Provider/product/API | Direct Meta Model API; Chat Completions; `https://api.meta.ai/v1/chat/completions` |
| Model/configuration | `muse-spark-1.3`; reasoning `low`; 2,048 output tokens; 60-second timeout; 12-call cap |
| Proposal measurements | 1 call; 13,280 measured tokens; 18,133.61 ms elapsed |
| Alternative | `run_10451d097a334683a5f9f1ab7adc45bc`; unchanged reviewed proposal; fresh live continuation |
| Alternative evaluation | 28/28; protected Exit 0; no tampering |
| Alternative execution alone | 9,434.96 ms |
| Advice arm, proposal included | 3 calls; 23,834 tokens; 27,568.57 ms total elapsed |
| Integrity | Parent unchanged; sibling preserved; exact proposal executed; untracked reproduction note restored |

The proposal identifies the removed timezone-offset conversion, keeps Z handling,
and restores subtraction of the parsed offset. Its expected-improvement wording
is a model prediction; the independent executed checks provide the outcome.
The full request, observable response, evidence references, exact source action,
commands, checks and role-specific usage are in
[branch.json](../evidence/meta-repair-2026-11-03/branch.json). The
[original export](../evidence/meta-repair-2026-11-03/original.json) preserves its
failed result and source diff.

### Same-checkpoint restart without advice

The declared experiment allowed at most 25 requests: up to 12 per arm, including
the repair arm's attached proposal, plus at most one extra proposal attempt.
Automatic retries were disabled. The restart used the same restored checkpoint,
discarded the pending action and received no proposal, explanation or original
future. The repair proposer could inspect the original public trace; this
information difference is declared rather than hidden.

| Measurement | Meta-proposed intervention | Restart without advice |
|---|---:|---:|
| Maximum calls | 12, including proposal | 12 |
| Actual calls | 3, including proposal | 3 |
| Measured tokens | 23,834 | 14,450 |
| Total elapsed | 27.57 seconds, including proposal | 15.31 seconds |
| Final checks | 28/28 | 28/28 |
| Protected exit / tampering | 0 / none | 0 / none |
| Monetary cost | Unknown | Unknown |

The restart record is `run_57c16608a60d444c97fce1d16108a2f1`, exported in
[restart.json](../evidence/meta-repair-2026-11-03/restart.json). Both arms passed.
This single curated fixture establishes **no repair-quality advantage over
restart**. The advice arm used more tokens and total time when proposal overhead
is included; branch execution time alone would omit that overhead.

Across this declared experiment there were **6 provider calls**, **38,284 measured
tokens**, **0 retries**, **0 failed provider calls/proposals/live branches** and
**2 retained injected failed runs**. Cost remains unknown because prices were not
configured. Earlier development failures described above are separate historical
attempts, not part of these six requests.

### Rejected misleading-green candidate

The injected negative record `run_e7f9eb95970b4a19b0cbf09bd701d844` has final visible
Exit 0 but **25/28**, protected Exit 1 and `tamper_detected: true`. Its altered
assertion and remaining behavior failures are preserved in
[tamper.json](../evidence/meta-repair-2026-11-03/tamper.json). This bad patch is
hand-authored and injected, not generated by Meta.

Proposal `ready` means structural validation passed, not behavioral success. The
runner and protected evaluator decide the executed outcome. Failures remain
evidence, and `insufficient_evidence` is an allowed model response rather than a
repair. Any later manual edit must be reported as manual.

The proposer sees public execution evidence plus aggregate verification status
and counts. Protected per-case diagnostics, definitions, expected answers and
reference repairs are excluded from its request. It may use observations after
the selected boundary in the original trace; that analysis access is retained
in the explicit intervention's provenance. Ordinary continuation receives the
restored prefix and explicit intervention, using fresh inference.

Exports contain the related original/proposal/checkpoint/branch and observable
model evidence, with configured credentials redacted. Review those exports before
publication; saved records are recorded evidence, not a new request made when
the reviewer opens them. Passing this curated fixture would not establish a
repeated success rate or a general advantage over restart.

The fixture and acceptance assets are public development inputs. Future recovery
evaluation needs separate frozen tasks, comparable budgets/information access,
repeated trials, and all failed/abandoned proposals and correction costs.
Earlier retail replay evidence does not validate coding restoration or isolation.
