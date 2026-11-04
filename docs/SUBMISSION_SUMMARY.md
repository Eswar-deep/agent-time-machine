# Agent Time Machine — submission summary

Prepared November 3, 2026, Chicago time. This is submission copy and observed
implementation evidence, not a confirmation that an entry has been submitted.

## Project description

Agent Time Machine helps developers debug coding agents. It records an execution,
asks a Meta model to identify a mistake and propose a correction at an existing
checkpoint, then makes that proposal reviewable and executable in an isolated
branch. Developers compare the actual code changes, command output and protected
test results with the original run. Failed attempts stay in history.

Meta generates evidence-based repair candidates. Agent Time Machine makes them
executable, inspectable and testable. A model's explanation cannot mark a repair
successful; the runner and independent evaluator decide the checked outcome.

## Exact Meta integration and executed role

- **Product/provider:** Meta Model API, directly through Meta. No inference partner
  intermediated these requests.
- **Model:** `muse-spark-1.3`, both requested and returned by the provider.
- **API:** Chat Completions at `https://api.meta.ai/v1/chat/completions`.
- **Roles:** repair proposer and continuing coding agent, recorded separately.
- **Configuration:** reasoning effort `low`, maximum 2,048 completion tokens per
  request, 60-second request timeout, at most 12 requests per arm including the
  attached proposal. No automatic retries or model-response cache.

The proposer received the task, candidate code and changes, execution events,
development-test output and available checkpoint IDs. Protected case definitions,
expected answers and reference corrections were excluded. It selected the
checkpoint before the injected parser edit, cited four existing event IDs, and
returned a structured replacement action. After review, that exact action was
executed. Two further Meta calls made fresh continuation decisions from the
restored prefix and explicit intervention; no saved future was reused.

Official model and protocol documentation checked on November 3:
[models](https://dev.meta.ai/docs/models) and
[Chat Completions](https://dev.meta.ai/docs/protocols/chat-completions).

## Observed demonstration

The synthetic JavaScript repository has frozen requirements and 28 protected
checks. A deliberately injected original patch accepts the reported `Z` timestamp
but drops timezone-offset adjustment. It passes its final visible test command
and fails three protected regressions.

| Attempt | Protected result | Provider calls | Measured tokens | Time |
|---|---|---:|---:|---:|
| Injected original | 25/28; rejected | 0 | 0 | 2.31 s |
| Meta proposal plus executed branch | 28/28 | 3 | 23,834 | 27.57 s total |
| Restart at the same checkpoint without advice | 28/28 | 3 | 14,450 | 15.31 s |
| Injected weakened-test candidate | 25/28; tampering detected | 0 | 0 | 1.09 s |

The repair time includes 18.13 seconds for proposal generation and 9.43 seconds
for branch execution and evaluation. The app's branch execution time alone
excludes the earlier proposal. Usage for the repair arm includes that proposal
once. Across both live arms: **6 provider calls, 38,284 measured tokens, no retries,
no failed provider requests, and unknown monetary cost**. There was one proposal,
and it passed validation on its first attempt. Both injected unsuccessful runs
are retained.

Both live arms passed. On this one curated fixture, the advised arm used more
tokens and greater total time. This does not establish better repair quality,
general superiority, or a population recovery rate.

The negative case changes a visible assertion to expect the parser's error. Its
final local command exits 0, but protected verification detects the changed test
and the still-broken reported and fractional `Z` formats. This bad patch is
hand-authored and labeled injected; it is not attributed to Meta.

See the [complete redacted evidence](../evidence/meta-repair-2026-11-03/README.md)
for request/response records, model-selected checkpoint, exact patch, lineage,
command output, usage and file digests.

## Implemented capabilities and limits

**Implemented:** live Meta repair proposals, strict structured validation,
evidence links, checkpoint selection, review before execution, independent branch
restoration, fresh continuation, protected evaluation, test-integrity detection,
patch comparison, request ledger, proposal history and redacted evidence exports.
Snapshots include supported file additions, edits, deletions, relevant untracked
files, conversation prefix, pending action and execution configuration. Parent
and sibling runs remained unchanged in the observed experiment.

**Recorded or injected:** the original regression and misleading-test negative
case are deterministic injections with real tool execution. Saved assistant
messages in unchanged replay are recorded playback. The evidence files preserve
actual live requests and executed results; inspecting them is not a new call.

**Incomplete or outside this prototype:** arbitrary host repositories and shell
commands, long-running multi-repository agents, production multi-user hosting,
public-web state restoration, and the optional search API/browser comparison.
Candidate execution supports the bounded JavaScript fixture in QuickJS
WebAssembly. The evaluator covers its 28 stated checks, not every possible parser
behavior. Local development access is not a public hosted app.

## Technologies actually used

- Meta Model API: live repair analysis, structured action proposals and fresh
  coding-agent decisions.
- QuickJS Emscripten: restricted WebAssembly execution of candidate JavaScript,
  without a host filesystem, process, network or environment bridge.
- Python, FastAPI, Uvicorn and SQLite: orchestration, API, immutable records,
  isolated evaluator coordination and persistence.
- React, TypeScript, Vite, CodeMirror and Lucide: the debugging interface, editor,
  timeline and evidence comparisons.
- pytest and Playwright: backend, boundary and browser verification.
- A pinned tau2-bench retail subset remains as an earlier secondary scenario; its
  replay counts do not validate coding recovery.

Baseten, Modal, Fireworks, Muse Code, Muse Image and SAM were not used in the
demonstrated workflow. There is no claim of integration with them.

## Integration benefits and problems observed

The actual Meta proposal identified the lost offset adjustment, selected the
pre-edit checkpoint, and produced an executable correction that passed the frozen
checks. Returning checkpoint and evidence IDs made the proposal inspectable and
allowed the app to reject invalid references before execution. Fresh continuation
ran the visible tests after the intervention.

The trace-rich proposal request consumed 13,280 tokens. Including proposal time
and usage exposed overhead that a branch-only timing would hide. The no-advice
restart also succeeded with fewer tokens and less total time; both results are
reported. The provider supplied token usage but no directly measured monetary
charge, so cost remains unknown rather than inferred from unverified prices.

No partner feedback, production reliability claim or broad model performance
claim is asserted. Validation completed: **105 backend tests, 13 browser tests,
and a production build**. See [validation](VALIDATION.md) and the
[submission checklist](SUBMISSION_CHECKLIST.md) for reproducibility and remaining
publication/form steps.
