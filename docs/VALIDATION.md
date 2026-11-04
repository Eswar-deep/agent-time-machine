# Validation evidence

[README](../README.md) · [Demo](DEMO.md) · [Sandbox](CODING_SANDBOX.md)

These are development acceptance results, not a held-out benchmark or measured
recovery advantage. Local records are in an ignored SQLite database. A fresh
clone must execute scenarios to create its own evidence.

## Recorded checks — November 3, 2026

| Check | Observed result |
|---|---|
| Backend pytest | 75 passed; one upstream Starlette/httpx deprecation warning |
| Browser suite using Edge | 11 passed against the real backend |
| TypeScript/Vite build | Passed; nonblocking bundle-size warning |

Coverage includes files and untracked metadata, context/configuration restoration,
immutable parents/siblings, failed alternatives, tampering, replay, exports,
provider errors/redaction, tool validation, source editing, and mobile layout.
Actual WASM checks cover absent host capabilities, rejected escape attempts,
bounded loops/allocation, and fresh contexts per case. See [sandbox](CODING_SANDBOX.md).

Model unit tests use mocked HTTP. Browser tests use deterministic scenarios and
make no paid calls.

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

## One verified live Meta repair

On November 3, 2026, `muse-spark-1.3` completed one original date-parser task:

| Measurement | Recorded value |
|---|---|
| Mode/provenance | `live_meta`; no injected patch |
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

This proves one live integration/fixture repair. A full live counterfactual
recovery experiment, repeated success rate, or advantage over retry/restart has
not been established. Mocked proposal/continuation tests are not additional
real-provider successes.

The fixture and acceptance assets are public development inputs. Future recovery
evaluation needs separate frozen tasks, comparable budgets/information access,
repeated trials, and all failed/abandoned proposals and correction costs.
Earlier retail replay evidence does not validate coding restoration or isolation.
