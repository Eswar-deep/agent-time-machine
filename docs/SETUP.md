# Setup and configuration

[Project overview](../README.md) · [Walkthrough](DEMO.md) · [Troubleshooting](TROUBLESHOOTING.md)

## Installation

Use Python 3.11 or 3.12 and Node.js 22 or later. On macOS or Linux, follow the
[quick start](../README.md#quick-start).

### Windows

From the repository root in PowerShell:

```powershell
py -3.11 -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.lock
npm ci
npm run build
.\.venv\Scripts\python.exe -m backend
```

Open http://127.0.0.1:8000. After the first build, `./scripts/start.ps1` can launch
the backend on Windows.

## Meta configuration

The deterministic demo runs locally without credentials. For live runs, use
[.env.example](../.env.example) as a template for a local `.env` file. Keep the key on the
server and restart the backend after updating the file.

| Setting | Default | Use |
| --- | --- | --- |
| `MODEL_API_KEY` | Empty | Meta Model API key |
| `META_MODEL` | Empty | Model accessible to the key's account. The recorded demo uses `muse-spark-1.3`. |
| `META_BASE_URL` | `https://api.meta.ai/v1` | Official endpoint used by the Chat Completions adapter |
| `ATM_LIVE_MAX_CALLS` | `0` | Per-run call allowance, from 0 to 12. Attached repair proposals count toward the branch allowance. |
| `ATM_LIVE_MAX_OUTPUT_TOKENS` | `2048` | Per-request completion token limit |
| `ATM_LIVE_TIMEOUT_SECONDS` | `60` | Per-request timeout in seconds |
| `META_REASONING_EFFORT` | `low` | One of `minimal`, `low`, `medium`, `high`, `xhigh`, or `max` |
| `META_INPUT_USD_PER_MILLION` | Empty | Optional input-token rate |
| `META_OUTPUT_USD_PER_MILLION` | Empty | Optional output-token rate |
| `ATM_DATABASE` | `data/agent-time-machine.sqlite3` | Local SQLite path |

The live run stops when its call allowance is exhausted. The dollar figure is an estimate
from recorded usage and configured rates. The interface shows an unknown cost when either
input is missing. A configured key still needs model access and billing on the provider side.

## Development

Start the backend through the virtual environment. In a second terminal, run
`npm run dev`. Vite serves port 5173 and proxies API calls to port 8000. Run
`npm run build` to refresh the frontend served directly by the backend.

Runs, checkpoints, proposals, and model usage persist in the SQLite file. Use **Export** to
save a run with its evidence and lineage. Exports redact configured credentials. Review the
remaining contents before sharing, since tool input, source code, and output are part of
the record.

Checkpoint compatibility checks cover the source, policy, model configuration, and runtime.
Record a fresh run when those settings change and an older checkpoint no longer validates.
