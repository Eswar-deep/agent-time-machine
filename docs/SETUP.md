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

A full live run requires more than a one-call smoke test; the verified fixture
used nine calls. A call allowance is not a dollar cap. Missing usage/rates produce
unknown cost. Check billing and model access for the key's account. A catalog
response or health's `meta.available` does not prove successful generation.

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
Exports include conversation, code, observations, and usage; review before sharing.

The **State** view includes all supported candidate files and tracked/untracked
metadata. The source checkout and protected evaluator are not writable candidate
files. See [sandbox scope](CODING_SANDBOX.md).
