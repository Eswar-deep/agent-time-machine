# Three-minute demo script

Target length: **180 seconds**. Use the actual application, saved run evidence
and request records. This is a recording plan, not a claim that a Meta proposal
has already passed. Replace the evidence slots below only after the real request,
branch execution and protected verification have completed.

## Evidence to select before recording

| Slot | Fill from the actual saved records |
|---|---|
| Original | Run ID, scenario, injected label, visible and protected results |
| Meta proposal | Proposal ID, selected checkpoint, evidence references, exact action |
| Provider | Actual provider, API surface, request model ID and returned model ID |
| Inference configuration | Reasoning effort, output-token limit, call cap, timeout |
| Alternative | Branch ID, patch provenance, fresh continuation model, final results |
| Measurements | Proposal and branch latency, all calls/tokens, cost or unknown |
| Negative case | Injected misleading-test run, visible exit, integrity/behavior failures |
| Optional comparison | Restart ID and outcome, same declared call cap, no repair advice |

Keep failed proposals and branches in history. Choose a complete pair for the
walkthrough without deleting the other attempts. A saved successful original
coding-agent run alone is not evidence of a Meta-proposed recovery branch.

## Shots and narration

| Time | Screen and action | Narration |
|---|---|---|
| **0:00–0:15** | Open the workbench with the injected **A fix that shifts time** original selected. Show task and original label. | "Agent Time Machine helps developers debug coding agents. A model can fix the reported example and still introduce a regression. We preserve the execution, branch before the mistake, and test a different decision." |
| **0:15–0:35** | **Results → Code changes**, then **Test results**. Show the timestamp fix and lost offset adjustment. | "This original mistake is deliberately injected for a repeatable demo. The patch accepts the reported UTC timestamp, but changes the instant represented by timezone offsets. The visible command passes; independent regression checks reject the resulting code." |
| **0:35–1:00** | Click **Analyze with Meta**, show request/loading state, then **Meta repair**. Show provider/model and saved proposal ID. | "Analyze with Meta makes an actual repair-proposer request to [provider and API], using [model ID]. It receives the task, execution events, code changes, development-test output and supported checkpoint IDs. Protected acceptance definitions and expected answers stay outside its prompt." |
| **1:00–1:25** | Scroll **Candidate mistake**, **Observed evidence**, **Selected checkpoint** and **Exact proposed action**. Show both source panes. | "The proposal cites these observations, selects this existing checkpoint before the intervention, and supplies this exact replacement. The application validates its references, path and supported action before execution. This expected improvement is a model prediction; it has not earned a passing result yet." |
| **1:25–1:45** | Click **Fork & execute proposal**. Show branch provenance and fresh continuation. If waiting is shortened, display a time-cut caption. | "We execute the reviewed proposal in an isolated branch. Files, relevant untracked state, pending action and ordinary agent context are restored to the selected boundary. The explicit intervention carries the proposer's analysis. Further agent decisions use fresh inference, while parent and sibling runs remain intact." |
| **1:45–2:15** | **Compare → Code changes**, **Test results**, then **Command output**. Keep final numbers legible. | "Here are the actual original and alternative patches. The runner executes candidate JavaScript inside a restricted WebAssembly runtime, and a protected evaluator checks the outputs. The original passed [original checks]; the alternative passed [alternative checks]. The command exits and regression results shown here determine the outcome." |
| **2:15–2:35** | Show proposal metrics and branch usage. If a completed restart comparison exists, briefly show it with its budget. | "The proposal took [latency], and the executed branch took [latency]. Across the demonstrated attempt, we recorded [calls] calls and [tokens] measured tokens. Monetary cost is [measured cost or unknown]. Failed attempts remain recorded. These are observations on one curated fixture, not a general recovery success rate." |
| **2:35–2:50** | Open the saved injected **The misleading green test** run. Show last visible **run_tests** result, changed assertion and final tampering failure. | "This second injected candidate changes a test to expect the parser's error. Its visible command exits zero, but the independent evaluation detects the changed test and remaining bug. A model explanation or green local command cannot approve a repair." |
| **2:50–3:00** | Return to comparison; show project name, public repository link and current verified result. | "Meta generates evidence-based repair candidates. Agent Time Machine makes them executable, inspectable and testable. The open-source repository includes setup, recorded evidence, actual test results and the limits of this prototype." |

## Recording and truthfulness notes

- The **Analyze with Meta** click is a new provider request only if a request is
  actually sent during that recording. If inspecting an existing proposal, add
  **Recorded result of a real Meta request** on screen and change the narration to
  "This saved proposal was generated through an actual request." Do not animate
  playback as a new model call.
- Keep the exact proposal unchanged for **Fork & execute proposal**. A source
  edit by the presenter changes its provenance to a manual intervention.
- If a proposal fails validation, the API fails, or the branch fails checks,
  show the failure. Replace the outcome narration accordingly. Do not use the
  manual correct patch as evidence of a successful Meta proposal.
- Label time cuts explicitly, for example **Waiting shortened; actual branch
  elapsed time shown in app**. Do not present three minutes of edited footage as
  three minutes of raw execution latency.
- An inherited `run_tests` Exit 1 before the correction is historical evidence.
  The later command and final protected checks evaluate the changed code.
- The proposal and continuation may appear in different panels. Count the
  proposal once when summarizing the branch's attached proposal usage; do not
  add the same request twice. Include failed/retried calls and correction
  overhead when claiming totals for the whole experiment.
- If showing a restart without advice, disclose the cap and information access
  for both branches. If no real comparison was executed, omit any comparative
  performance claim.
- Hide credentials, billing identifiers and unrelated browser content. Retain
  model/provider names, synthetic source, errors, provenance and measured usage.
- Before publishing, replace every bracketed evidence slot in the final
  narration, test the public repository and video links, and verify video
  duration. Upload and final submission remain separate actions.

See [submission checklist](SUBMISSION_CHECKLIST.md), [demo guide](DEMO.md) and
[validation evidence](VALIDATION.md).
