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
| POST | `/api/experiments` | Compare a baseline with one instruction change under the supervised coding policy |
| GET | `/api/runs/{id}` | Full run, checks, events, checkpoint summaries |
| GET | `/api/runs/{id}/export` | Redacted run, lineage, checkpoints, proposals and model evidence |
| GET | `/api/runs/{id}/compare` | Branch versus parent and integrity evidence |
| POST | `/api/runs/{id}/branches` | Restore, intervene, continue, evaluate |
| POST | `/api/runs/{id}/restarts` | Fresh Meta decisions from a checkpoint without repair advice |
| POST | `/api/runs/{id}/replay` | Reexecute tools and compare observations/state |
| POST | `/api/runs/{id}/proposals` | Request a structured live Meta proposal; model selects coding checkpoint |
| GET | `/api/runs/{id}/proposals` | Saved proposal history, including failures and insufficient evidence |
| GET | `/api/proposals/{id}` | Retrieve one saved proposal |
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

## Compare runs

The Playground calls `POST /api/runs` twice with the same `scenario_id` and modes
`deterministic_demo` and `live_meta`. Each run has its own saved ID, outcomes, and
usage. The live mode uses the configured Meta key. The deterministic mode uses
local tools with zero model requests.

For a supervised prompt experiment, send `POST /api/experiments` with
`scenario_id: "coding-date-parser"` and a nonempty `variant_instruction`.
The baseline and variant both run live with the same protected tests. The
response includes a summary for each arm, blocked-action counts, and the
supervisor assessment. Supervisor calls count toward each run's allowance.

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
and `content` replaces the entire file or creates a new one. `delete_file` removes
an existing nonrequired path; deleting the parser or visible test file is rejected.
Tracking metadata retains tracked deletions. The replacement action executes once,
then a fresh continuation runs. Inherited failures remain historical; final
checks evaluate the resulting state. Parents and siblings remain immutable.

## Live coding proposals

Send `{}` or `{ "checkpoint_id": null }` to let Meta select an existing supported
checkpoint. An optional nonnull `checkpoint_id` is a preferred boundary, not a
substitute for validating the model's selected checkpoint. Retail's retained
legacy proposer still requires an explicitly chosen checkpoint.

```powershell
$proposal = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/runs/$($run.id)/proposals" -ContentType 'application/json' -Body '{}'
$proposal.status
$proposal.checkpoint_id
$proposal.evidence_refs
$proposal.explanation
$proposal.action
```

The coding model returns exactly these fields: `status`, `checkpoint_id`,
`evidence_refs`, `explanation`, `expected_improvement`, and `action`. A ready
proposal needs a supported checkpoint, at least one unique original event
reference, explanation, expected improvement, and a validated action. For
`write_file`, `content` is complete bounded replacement source, not a diff.
`insufficient_evidence` has no executable checkpoint/action. A malformed response,
unsupported path/action/checkpoint, or API error is saved as `failed`; no fallback
repair is substituted. HTTP 201 indicates the proposal record exists even when
its status is failed.

The response also records proposal ID, original run, raw observable response,
available checkpoint IDs, public-context hash, actual model/provider/API surface,
generation configuration, calls, latency and available usage. It never executes
automatically. GET the run's proposal history or `/api/proposals/{id}` to reopen
ready, failed and insufficient-evidence attempts after a reload.

The public proposer context includes the task, candidate files/diffs, execution
events, visible tool errors, development-test observations and supported
boundaries. Protected acceptance definitions, individual protected results,
expected answers and reference patches are excluded; only aggregate verification
status and counts cross that boundary.

After reviewing a ready proposal, execute its unchanged action:

```powershell
if ($proposal.status -ne 'ready') { throw 'No executable proposal; inspect its saved error or explanation.' }
$proposalBranchBody = @{
    checkpoint_id = $proposal.checkpoint_id
    tool = $proposal.action.tool
    arguments = $proposal.action.arguments
    continuation = 'live_meta'
    proposal_id = $proposal.id
} | ConvertTo-Json -Depth 12
$alternative = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/runs/$($run.id)/branches" -ContentType 'application/json' -Body $proposalBranchBody
$alternative.outcome
```

The proposal must belong to this original and match its checkpoint and action
exactly. Fresh `live_meta` continuation is required. Edited proposals are manual
interventions and must omit `proposal_id`. The intervention retains analysis
provenance and evidence references; ordinary continuation restores only the
checkpoint prefix, without saved future responses.

## Restart without advice

```powershell
$restartBody = @{ checkpoint_id = $proposal.checkpoint_id } | ConvertTo-Json
$restart = Invoke-RestMethod -Method Post -Uri "$baseUrl/api/runs/$($run.id)/restarts" -ContentType 'application/json' -Body $restartBody
```

This discards the recorded pending action and makes fresh Meta decisions from
the same restored boundary. It supplies no proposed patch, explanation or
original future. The saved record has `restart.kind` set to
`checkpoint_restart_without_advice`. A repair branch's call cap includes its
attached proposal; the restart receives the same cap without advice. Earlier
abandoned proposals remain in the global ledger, so total experiment overhead
can exceed one branch's usage. Report both outcomes without assuming a winner.

## Exports, replay, and errors

Health availability means configuration availability, not proven generation.
Visible Exit 0 does not override protected behavior or integrity failures.
Replay validates recorded tool observations/state; assistant messages are recorded
playback and task success is not independently rescored.

Exports use format `agent-time-machine-export-v1`. They include `run`, complete
`checkpoints`, `parent`, related `proposals`, attached `proposal`, `fork_checkpoint`,
and relevant `model_calls`. Model-call records identify role, actual request and
observable response, requested/returned model, endpoint, configuration, latency,
usage and any failure. Protected evaluator results are review evidence; they are
not placed into the repair prompt. Export and model/proposal read endpoints redact
configured credentials recursively. If redaction changes a checkpoint's content,
the export flags it and warns that its original checksum may not match; never
bypass restore validation to load modified evidence.

Missing resources return 404; model/runtime failures can return 409; invalid
arguments or incompatible checkpoints return 422. Disallowed POST origins return
403. Invalid or oversized content lengths return 413 (declared local limit 1 MB).
Browser origins on localhost/127.0.0.1 ports 5173 and 8000 are supported.
