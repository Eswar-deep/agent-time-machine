# Local API

[README](../README.md) · [Architecture](ARCHITECTURE.md) · [Setup](SETUP.md)

Base URL: `http://127.0.0.1:8000`. Interactive OpenAPI docs: `/docs`.
The server is intended for loopback use and has no production authentication.

| Method | Route | Purpose |
|---|---|---|
| GET | `/api/health` | Runtime/configuration availability and aggregate model usage |
| GET | `/api/scenarios` | Scenario catalog |
| GET | `/api/runs` | Saved summaries, newest first |
| POST | `/api/runs` | Execute and save an original run |
| GET | `/api/runs/{id}` | Full run, checks, events, checkpoint summaries |
| GET | `/api/runs/{id}/export` | JSON run and complete checkpoints |
| GET | `/api/runs/{id}/compare` | Branch versus parent and integrity evidence |
| POST | `/api/runs/{id}/branches` | Restore, intervene, continue, evaluate |
| POST | `/api/runs/{id}/replay` | Reexecute tools and compare observations/state |
| POST | `/api/runs/{id}/proposals` | Request a Meta patch proposal for review |
| GET | `/api/checkpoints/{id}` | Retrieve and validate a compatible checkpoint |
| POST | `/api/checkpoints/validate` | Validate an imported checkpoint |
| GET | `/api/model-calls` | Object containing `calls`, `usage`, and `scope` |

## Create a run

```powershell
$baseUrl = 'http://127.0.0.1:8000'
$body = @{ scenario_id = 'coding-date-parser'; mode = 'deterministic_demo' } | ConvertTo-Json
$run = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/runs" -ContentType 'application/json' -Body $body
$run.outcome
```

Use `coding-test-tamper` for **The misleading green test**. Mode `live_meta`
uses real provider requests and requires configured credentials and allowance.
Execution is synchronous and can take several model calls.

**HTTP 201 means a record was created, not that the candidate succeeded.**
Inspect `execution`, `outcome`, `verification`, and any recorded error.

## Manual branch

Save a complete parser as `repair.js` yourself before running this example:

```powershell
$checkpoint = $run.checkpoints | Where-Object { $_.tool -eq 'write_file' } | Select-Object -First 1
$branchBody = @{
    checkpoint_id = $checkpoint.id
    tool = 'write_file'
    arguments = @{ path = 'timestamp_parser.js'; content = Get-Content -LiteralPath './repair.js' -Raw }
    continuation = 'deterministic_demo'
} | ConvertTo-Json -Depth 5
$branch = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/runs/$($run.id)/branches" -ContentType 'application/json' -Body $branchBody
Invoke-RestMethod -Uri "$baseUrl/api/runs/$($branch.id)/compare"
```

The checkpoint must belong to the parent. Paths address only the virtual snapshot,
and `content` replaces the entire file. The replacement action executes once,
then a fresh continuation runs. Inherited failures remain historical; final
checks evaluate the resulting state. Parents and siblings remain immutable.

## Proposals, replay, and errors

POST `{checkpoint_id}` to the proposal route. Review the returned status and
source; a proposal can fail and never executes automatically. Execute an unedited
reviewed proposal with its `proposal_id` and `continuation: "live_meta"`.
Edited proposals are manual interventions. Provider attempts and proposal costs
remain in usage; original future messages are excluded from fresh continuation.

Health availability means configuration availability, not proven generation.
Visible Exit 0 does not override protected behavior or integrity failures.
Replay validates recorded tool observations/state; assistant messages are recorded
playback and task success is not independently rescored. Exports use format
`agent-time-machine-export-v1` with `run` and `checkpoints`.

Missing resources return 404; model/runtime failures can return 409; invalid
arguments or incompatible checkpoints return 422. Disallowed POST origins return
403. Invalid or oversized content lengths return 413 (declared local limit 1 MB).
Browser origins on localhost/127.0.0.1 ports 5173 and 8000 are supported.
