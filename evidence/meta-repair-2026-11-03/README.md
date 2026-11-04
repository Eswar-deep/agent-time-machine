# Actual Meta repair evidence — November 3, 2026

These records were exported from actual executions on November 3, Chicago time
(November 4 UTC). They contain a real Meta Model API request and response connected
to its executed branch, alongside an advice-free restart and an injected negative
case. All fixture data is synthetic. No API credentials are included.

| Record | Contents |
|---|---|
| [Manifest](manifest.json) | IDs, configuration, measurements, integrity assertions and SHA-256 digests |
| [Original](original.json) | Injected regression, task, files, six checkpoints, visible commands and protected results |
| [Meta repair](branch.json) | Exact proposal/request/response, selected checkpoint, executed patch, fresh continuation, parent and evaluation |
| [Restart without advice](restart.json) | Fresh decisions from the same checkpoint without the intervention or original suffix |
| [Negative case](tamper.json) | Injected weakened assertion, green final visible command and independent rejection |

The `parent` record in the repair and restart exports is identical to the original
run. Both branches share checkpoint `cp_8634588107184a0daddae404fc25a79a`.
Proposal `proposal_f80f3e9a526e4e26b813867e2ada3364` selected that checkpoint itself.
The repair's `patch.after` exactly matches the proposal action. Restored files
include the untracked reproduction note. The manifest records these checks.

## Observed results and budget

| Arm | Checks | Calls | Tokens | Elapsed |
|---|---:|---:|---:|---:|
| Injected original | 25/28 | 0 | 0 | 2.31 s |
| Meta proposal + continuation | 28/28 | 3 | 23,834 | 27.57 s |
| Restart without advice | 28/28 | 3 | 14,450 | 15.31 s |
| Injected test tampering | 25/28 | 0 | 0 | 1.09 s |

Declared before evaluation: at most 12 requests for each arm, with the attached
proposal counted against the repair allowance; at most one additional proposal
attempt; no automatic retries; maximum 25 requests across the experiment. Actual
usage was six successful provider requests and 38,284 tokens, with no extra
proposal attempt. Monetary cost is unknown.

The repair total is proposal elapsed time (18,133.61 ms) plus branch elapsed time
(9,434.96 ms). The branch's own `elapsed_ms` covers only execution and evaluation;
its `usage` includes the attached proposal once. Do not add proposal usage again.
`latency_ms` in usage aggregates provider request latency and is a different
measurement from overall elapsed time.

Both live arms passed 28 checks. This curated example demonstrates an executable,
verified Meta proposal, but no quality advantage over the restart. The repair arm
used more tokens and total time. Neither this pair nor earlier retail replay
results establishes general coding-agent recovery performance.

The injected negative case's first visible command exits 1 and its last exits 0.
The final protected command exits 1: the visible tests changed, the reported `Z`
format still fails, and fractional `Z` still fails. The two commands evaluate
different code/test states; a historical failure is not erased by a later pass.

## Inspecting the records

Exports use the app's `agent-time-machine-export-v1` format. They preserve actual
commands, stdout/stderr, structured results, sources and provenance. The Meta
records include request model, returned model, direct provider endpoint, role,
generation configuration, response ID, usage and latency.

Proposer input is under the proposal call's `request.messages`. It contains public
development evidence and aggregate verification counts, without protected case
definitions, expected results or reference repairs. Evaluation outputs in other
parts of the export are for the reviewer; they were not supplied to the proposer
or ordinary continuation.

The baseline export contains the source run's proposal history for audit, because
the general export includes related proposals. That does **not** mean the restart
received it. The restart has `patch: null`, no repair-proposer role, and
`restart.failed_trace_access: false`; inspect its actual model requests to verify
the context it received. Inherited events are marked separately from fresh calls.

JSON files can be read directly without a credential or provider call. A new clone
starts its own local database and does not automatically import these saved runs.
Use the [setup](../../docs/SETUP.md) and [demo](../../docs/DEMO.md) instructions for
a new execution. Checkpoint compatibility binds these records to the recorded
source and runtime; do not bypass validation to force an old checkpoint into
modified code.

Original bad patches are labeled injected. The alternative proposal and continuing
decisions are live generated; later inspection/video of those saved records is
recorded inspection. Failed cases remain in this package. These exports are
evidence, not a claim that every possible behavior or environment is supported.
