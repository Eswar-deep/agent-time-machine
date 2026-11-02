# Execution contracts

The app supports one custom, pre-authorized retail request at a time, one tool
call per decision, and no interactive user simulator. It records observable
messages and tool results, not hidden model reasoning.

## Components

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
3. **Intervention:** restore pre-action state and execute a declared change plus
   fresh continuation. A successful intervention supports that change in this
   sandbox, not a unique causal diagnosis.

## Grading boundary

State, final communication, basic authentication, exact upfront consent, and
execution completion are checked separately. Unrelated state must be preserved.
Full retail policy, natural-failure recovery, user-simulator replay, and
unrestricted environments are not supported claims.

The deterministic demo and its three fixtures are a development set with
injected faults. No held-out live evaluation is reported. Future evaluation
must freeze separate tasks before tuning and compare fresh retry, restart,
and intervention under comparable budgets and information access.

## Model boundary

The continuing agent receives the public task, custom policy, allowed schemas,
and observations. It has no file tool or evaluator/gold-data access.
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
system, interactive user simulation, external rollback, complete policy
verifier, live benchmark result, or claimed novel invention of time travel.
DoVer and framework time-travel facilities overlap with this workflow, as the
handoff acknowledges; the unavailable validation report's source links have not
been inspected.

