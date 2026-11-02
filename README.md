# Agent Time Machine

**Record an agent run. Rewind a decision. Change the action. Compare the evidence.**

A local execution debugger for one tool-using retail agent, built for the Meta
Global AI Developer Hackathon. The interface operates on real, persisted tool
executions in a pinned tau2 retail simulator subset.

The offline demo deliberately injects a bad decision. A manual correction can
change the outcome while preserving the original run. That demonstrates an
intervention in this environment; it does not establish a unique root cause,
universal rollback, or a measured advantage in live agent recovery.

## Run locally

Requires **Python 3.11+** and **Node.js 22+**. The environment and dependencies
are already prepared in this checkout.

From PowerShell in the repository:

```powershell
npm run build
.\.venv\Scripts\python.exe -m backend
```

Open **http://127.0.0.1:8000**. Or use `./scripts/start.ps1` after building.
The first startup executes and saves the default deterministic scenario.

For a new checkout, create an environment using a Python 3.11+ interpreter:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
npm ci
npm run build
.\.venv\Scripts\python.exe -m backend
```

If the Windows Python launcher is unavailable, substitute the absolute path of
your Python 3.11+ executable. This workstation used the existing `geo-hunt`
conda environment only to create the project-local virtual environment.
Linux/macOS: `python3.11 -m venv .venv`, then use `.venv/bin/python`.

For UI development, run the backend and `npm run dev` in separate terminals.
Vite serves on port 5173 and proxies API requests to port 8000.

## Try the intervention

1. Run **The wrong order** in **Deterministic demo** mode.
2. Select the `cancel_pending_order` checkpoint.
3. Change `order_id` from `#W1048202` to `#W1048201`.
4. Select **Fork & execute**.
5. Inspect the checks, state differences, and verified parent hash.

Also try **A digit off** (postal code) and **The refund detour** (refund method).
All are synthetic development tasks using tau2 tools, **not official benchmark
tasks or scores**. The offline policy is explicitly scripted and never presented
as Meta output. [The demo script](docs/DEMO.md) includes failure, restart, replay,
and incompatible-checkpoint walkthroughs.

## What is implemented

- A React/TypeScript debugger with scenario selection, saved run history,
  execution timeline, checkpoint state/context, JSON intervention editor,
  isolated forks, outcome comparisons, and JSON exports.
- SQLite persistence, append-only saved runs, independent branch state, and
  SHA-256 integrity checks.
- Checkpoints containing environment, conversation prefix, pending action,
  agent cursor/configuration, tool schemas, source/policy/runtime fingerprints,
  lineage, boundary, and declared randomness behavior.
- Unchanged replay of **all reads and writes**, with observation and final-state
  comparisons. Saved assistant messages are explicitly recorded playback.
- A fresh deterministic continuation after manual changes, or an opt-in fresh
  Meta continuation. The original future is excluded.
- Independent task-state, final-communication, authentication, and custom
  upfront-consent checks. Full retail dialogue policy is **not evaluated**.
- An opt-in Meta adapter, reviewed structured patch proposals, strict tool
  validation, request identities, bounded calls/output, timeouts, and a ledger
  that includes failed requests and proposal costs.

## Meta configuration

Copy [.env.example](.env.example) to `.env` and configure the **server**
environment. Never put credentials in the browser, chat, or a commit.

- `MODEL_API_KEY`: your Meta Model API key.
- `META_MODEL`: a model your account can access.
- `ATM_LIVE_MAX_CALLS`: explicit allowance from 1 to 12 per run. Defaults to 0,
  which prevents live calls. An attached proposal counts toward its branch.
- Optional output-token and timeout bounds are documented in the example.
- Optional per-million-token rates enable an estimate from measured usage.
  Missing rates or usage are reported as unknown, never as zero.

The adapter uses Meta's documented
[Chat Completions protocol](https://dev.meta.ai/docs/cookbook/quickstart-chat-completions)
and [tool-calling format](https://dev.meta.ai/docs/cookbook/tool-function-calling)
at `https://api.meta.ai/v1`, checked October 30, 2026. The example model is
`muse-spark-1.3`; account access is not assumed or verified.

**No live model calls have been made during implementation.** Model tests use a
mock HTTP transport. A live branch and live recovery evaluation remain gated on
account access and an explicit allowance. The local demo works without them.
No model-response cache is implemented. Retries are disabled.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest tests -q
npm run build
npm run test:ui
```

Browser tests use installed Edge on Windows. For bundled Chromium, run
`npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=bundled`.
The browser suite uses the real backend, not mocked UI data.

See [implementation state](docs/PROGRESS.md) for the latest observed results,
[architecture and contracts](docs/ARCHITECTURE.md), and
[third-party attribution](THIRD_PARTY.md).

## Data and boundaries

Runs and checkpoints live in `data/agent-time-machine.sqlite3`; override with
`ATM_DATABASE`. Restarting the app preserves them. Exports contain the synthetic
conversation, observations, snapshots, patch provenance, and usage records.
The live ledger is available at `/api/model-calls`; API docs at `/docs`.

The server binds to loopback and has no production authentication or deployment.
Simulator tools do not send email, make payments, or contact real stores.
Checksums detect accidental modifications, not adversarial tampering.
Source/policy/runtime changes intentionally make old checkpoints unsupported;
saved runs remain inspectable when their integrity checks pass.

The supplied validation ZIP was not attached and its authenticated Library link
could not be fetched. Its report and historical numerical results have not been
reproduced. Instead, the retail source was retrieved at the exact supplied
commit, with original behavior and license retained.

