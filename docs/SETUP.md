# Setup

[README](../README.md) · [Demo](DEMO.md) · [Troubleshooting](TROUBLESHOOTING.md)

## Installation

Validated on Windows with Python 3.11, Node.js 22, and Microsoft Edge for browser
tests. Clone the repository and follow the [quick start](../README.md#quick-start).
Use the project interpreter with `python -m pip`, rather than a global pip.

The Python lock records the tested Windows environment, including Windows-only
packages. On Linux/macOS, use `python3.11 -m venv .venv`, `.venv/bin/python`,
and install `requirements.txt`. That platform path is not separately validated.
JavaScript dependencies and the pinned WASM runtime use `npm ci`.

The built app runs on http://127.0.0.1:8000. Its first startup records a default
deterministic scenario. Later launches can use `./scripts/start.ps1`.
Run only one backend on port 8000.

## Meta configuration

Deterministic mode needs no credentials. For live calls, copy
[.env.example](../.env.example) to a new `.env` file; preserve any existing key.
Restart the backend after editing configuration. A browser refresh is insufficient.

| Variable | Default | Meaning |
|---|---|---|
| `MODEL_API_KEY` | Empty | Meta Model API key; server-side only |
| `META_MODEL` | Empty; example: `muse-spark-1.3` | Model accessible to the key's account |
| `META_BASE_URL` | `https://api.meta.ai/v1` | Supported provider endpoint |
| `ATM_LIVE_MAX_CALLS` | `0` | Explicit per-run allowance, capped at 12; attached proposals count |
| `ATM_LIVE_MAX_OUTPUT_TOKENS` | `2048` | Request output budget, including reasoning and visible output |
| `ATM_LIVE_TIMEOUT_SECONDS` | `60` | Request timeout |
| `META_REASONING_EFFORT` | `low` | Captured in live requests and checkpoint configuration |
| `META_INPUT_USD_PER_MILLION` | Empty | Optional input-token price |
| `META_OUTPUT_USD_PER_MILLION` | Empty | Optional output-token price |
| `ATM_DATABASE` | `data/agent-time-machine.sqlite3` | SQLite persistence path |

The current adapter is **direct Meta Model API**, using **Chat Completions** at
`https://api.meta.ai/v1/chat/completions`. `muse-spark-1.3` is the verified configured
model. The adapter rejects other provider URLs rather than sending credentials
to an unofficial endpoint. Each live record stores the actual model and role;
`repair_proposer` and `continuing_agent` are separate roles even when they share
the same provider/model.

A full live run requires more than a one-call smoke test; the verified fixture
used nine calls. A call allowance is not a dollar cap. Missing usage/rates produce
unknown cost. Check billing and model access for the key's account. A catalog
response or health's `meta.available` does not prove successful generation.

For the main recovery demo, create a labeled deterministic **A fix that shifts
time** original, then click **Analyze with Meta**. This makes a live proposal call
even though the original is scripted. The model selects a supported checkpoint;
review its evidence and exact action before **Fork & execute proposal**. The
unchanged reviewed proposal requires fresh Meta continuation, so leave room for
both proposal and continuation calls. A manual-only repair does not complete the
required submission workflow.

The branch call cap includes its attached proposal. Failed or abandoned proposals
remain in the ledger and consume the original's proposal allowance. **Restart
without advice** uses the same declared cap without repair advice. The per-branch
cap is not a global experiment budget: count all attempts when reporting overhead.

The recorded November 3 recovery used one proposal plus two fresh continuation
requests within its 12-call cap. That observation is not a guaranteed future
call count. The [evidence manifest](../evidence/meta-repair-2026-11-03/manifest.json)
records the actual request configuration and comparison budget.

Supported reasoning settings are `minimal`, `low`, `medium`, `high`, `xhigh`,
and `max`; invalid settings are rejected before HTTP. Small output limits may
be exhausted by reasoning before producing a usable tool response.

Keys and local data are ignored by Git. Keep credentials out of source,
screenshots, exports, and browser code. Live HTTPS access belongs to the trusted
backend; candidate guest isolation remains unchanged.

## Development and persistence

Run the backend and `npm run dev` in separate terminals. Vite serves port 5173
and proxies API requests to port 8000. Rebuild to update the interface served
on port 8000. Restart after backend changes. Source/runtime changes can invalidate
old checkpoints; record a new run when that happens.

SQLite stores runs, checkpoints, proposals, and model-call attempts across
restarts. Dependencies, builds, local data, credentials, and scratch logs are not
included in a fresh clone. **Export** saves a run with its checkpoints.
Exports also include the parent, fork checkpoint, attached/related proposals and
relevant model calls, with observable requests/responses and provider/model roles.
Configured credentials are removed recursively, but review the evidence for any
other private content before sharing. Redaction can change a checkpoint's content
without updating its original checksum; such exports carry a restoration warning.

The **State** view includes all supported candidate files and tracked/untracked
metadata. Additions and edits live in the snapshot map; deleted tracked paths
remain in baseline tracking metadata. A Git commit is not required to capture
dirty candidate state. The source checkout and protected evaluator are not
writable candidate files. See [sandbox scope](CODING_SANDBOX.md).

## Submission materials

The supplied organizer announcements require a **3-minute video** and an
**open-source GitHub repository**. The [MIT license](../LICENSE) covers original
project code; keep [third-party notices](../THIRD_PARTY.md). A private remote and
loopback app URL do not give reviewers access. Follow the [submission checklist](SUBMISSION_CHECKLIST.md)
and [video script](VIDEO_SCRIPT.md); no final submission or public deployment is
implied by a local run.
