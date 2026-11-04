# Execution contracts

The primary workflow is one small coding repository with a frozen bug report and
acceptance contract. The earlier pre-authorized retail domain remains supported.
Both use one tool call per decision and record observable messages and results,
not hidden model reasoning.

## Components

- [domains](../backend/domains.py): small adapter dispatch retaining common
  recording, checkpoints, model calls, storage, lineage, and API contracts.
- [coding](../backend/coding.py): virtual file snapshots, tracked/untracked
  metadata, bounded file tools, scripted injected demo, and source differences.
- [coding runtime](../backend/coding_runtime.py): sanitized subprocess execution,
  hard watchdogs, runtime identity, and protected-verifier orchestration.
- [WASM launcher](../scripts/coding_sandbox.mjs): actual candidate execution in
  QuickJS, with no guest host-capability bridges.
- [protected verifier](../backend/coding_verify.py): frozen expected results and
  test-integrity checks outside candidate memory; emits real CLI results.

- [environment](../backend/environment.py): pinned tau2 retail adapter, strict
  tool allowlist/argument validation, snapshots, source compatibility.
- [agent](../backend/agent.py): explicitly scripted deterministic demonstration
  policy; computes fresh observations/messages after an intervention.
- [checkpoints](../backend/checkpoints.py): complete supported state at a
  pre-tool boundary, checksums, version/schema/runtime rejection.
- [engine](../backend/engine.py): run recording, immutable lineage, isolated
  forks, all-tool replay, proposals, comparison evidence.
- [store](../backend/store.py): SQLite transactions and append-only saved runs;
  checkpoints, model-call ledger, proposals.
- [models](../backend/models.py): opt-in bounded Meta requests, exact request
  identity, usage/error/latency ledger, no retries or response cache.
- [evaluator](../backend/evaluator.py): independent, scoped outcome checks.
  Its expectations and code never enter candidate or proposer prompts.
- [API](../backend/api.py) and [interface](../src/App.tsx): local HTTP operations
  and an inspectable debugger workflow.

## Checkpoints and forks

Each tool checkpoint stores environment data, conversation prefix, pending
action, agent cursor/configuration, tool schemas, relevant source/policy hashes,
Python version, lineage, boundary, and whether local randomness is used.
Local randomness is unused; live provider sampling is not deterministic.

Coding checkpoints include all file contents, including relevant untracked
files, the frozen fixture identity, execution configuration, and runtime hashes.
Live configuration includes model identity, reasoning effort, and execution
bounds. Observable progress text before a tool call belongs to that checkpoint's
conversation prefix; later messages are excluded from fresh continuation.
They are file snapshots, not suspended OS processes or general Git worktrees.
File-edit tools touch only that snapshot. Protected cases and example correction
patches remain outside the candidate file map and all model prompts.

The trusted verifier runs as a separate Python CLI. It sends only case inputs
and opaque IDs to fresh WASM guest contexts, receives primitive observations,
and compares them against host-held expectations. Candidate-visible tests run
separately and may be misleading; their source hash is checked independently.
Missing runtime, incomplete observations, timeouts, or verifier failure cannot
produce a passing task.

A fork validates the checkpoint before constructing a separate database object.
It inherits only events and conversation before the boundary. It replaces the
pending action with a declared manual or reviewed model patch, executes that
action, and runs a fresh continuation. Original downstream answers are not
substituted as new responses. Patch provenance and continuation type are stored.

The original and siblings are not updated. A parent's hash is saved when the
branch is created and checked again for the comparison view. Database triggers
prevent app-level updates/deletes of saved runs.

## Three distinct modes

1. **Recorded playback:** read saved events without execution.
2. **Unchanged tool replay:** execute every recorded tool in order, including
   reads and error-producing calls. Compare all observations and final state.
   Displayed assistant messages remain recorded; task success is not rescored.
   Coding replay excludes measured duration fields from equality checks but
   retains raw command output and compares code, exit statuses, and observations.
3. **Intervention:** restore pre-action state and execute a declared change plus
   fresh continuation. A successful intervention supports that change in this
   sandbox, not a unique causal diagnosis.

## Grading boundary

State, final communication, basic authentication, exact upfront consent, and
execution completion are checked separately. Unrelated state must be preserved.
Full retail policy, natural-failure recovery, user-simulator replay, and
unrestricted environments are not supported claims.

The coding fixture and retail scenarios are development experiments with
explicit injected faults. Coding has 25 frozen behavior cases plus independent
test integrity, visible-command, and execution-completion checks. The supplied
alternative is manual, not live-model recovery. No held-out live evaluation is reported. Future evaluation
must freeze separate tasks before tuning and compare fresh retry, restart,
and intervention under comparable budgets and information access.

## Model boundary

The continuing agent receives the public task, custom policy, allowed schemas,
and observations. Coding file tools access only the virtual candidate snapshot;
retail has no file tool. Neither domain exposes evaluator/gold-data access.
A separate repair proposer may read the entire failed trace, but no grader
internals. That expanded access is recorded. Proposals never execute until
reviewed; edited proposals must execute as manual interventions.

Each provider attempt is logged immediately, including failures and abandoned
proposals. Branch usage includes its attached proposal and fresh continuation,
excluding reused parent-prefix cost. The global ledger also retains unattached
and failed proposal calls. Actual usage may be unavailable; cost then stays
unknown. Calls/output/timeouts are bounded and retries disabled.

## Limitations

There is no production authentication, deployment, concurrent background job
system, interactive user simulation, external rollback, arbitrary-repository
shell execution, complete retail policy verifier, live benchmark result, or
claimed novel invention of time travel.
DoVer and framework time-travel facilities overlap with this workflow, as the
handoff acknowledges; the unavailable validation report's source links have not
been inspected.

