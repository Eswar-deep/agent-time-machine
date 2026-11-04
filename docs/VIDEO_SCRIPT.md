# Three-minute demo video and actual narration

The completed [demo video](assets/agent-time-machine-demo.mp4) is **180.0 seconds**,
1920?1080, H.264 at 30 fps with AAC narration. It records inspection of the actual
saved Meta request and executed branches described in the
[evidence package](../evidence/meta-repair-2026-11-03/README.md).

The persistent caption says **Recorded inspection of a real Meta execution**.
There were no new provider requests while recording: all browser POSTs were
blocked. This is a narrated walkthrough of saved actual evidence, not footage of
new inference. The original regression and weakened-test candidate are explicitly
labeled injected. Narration was synthesized locally with Microsoft Zira; it does
not imitate a team member or partner.

The final comparison caption includes both arms' measured tokens and total time,
including proposal overhead. No recovery advantage is claimed: both passed 28/28.
See [video metadata](assets/demo-metadata.json) for encoding, duration and digest.
The [submission summary](SUBMISSION_SUMMARY.md) supplies accompanying form copy.

## Actual narration

## 0–12 seconds

Agent Time Machine helps developers debug AI coding agents. This is recorded inspection of a real Meta execution. No new inference occurs.

## 12–34 seconds

The task is to fix a JavaScript date parser without changing the instant represented by timezone offsets. This original mistake is deliberately injected. It accepts the reported UTC example but drops timezone handling. Actual protected checks reject the regression: 25 of 28 implemented checks pass.

## 34–52 seconds

The repair proposer uses the direct Meta Model API and Chat Completions. It inspected the task, development-test output, recorded events, and available checkpoints. Protected acceptance definitions and expected answers were excluded. This saved proposal came from one actual model request.

## 52–74 seconds

Meta identified a likely mistake, cited recorded evidence, selected an existing checkpoint, and returned a bounded replacement action. The review shows the exact source, expected improvement, model configuration, measured usage, and analysis provenance. A model explanation alone never marks a repair successful.

## 74–92 seconds

The runner restored the selected checkpoint into an isolated branch and applied the reviewed proposal. The continuing agent used fresh Meta inference, excluding the original future. The branch passed 28 of 28 implemented checks. The parent remained unchanged.

## 92–110 seconds

Original and alternative patches appear side by side. Checkpoints capture files, untracked files, pending actions, configuration, and conversation context. Each branch restores its own state. Candidate JavaScript runs in a restricted WebAssembly environment with timeouts.

## 110–130 seconds

Both candidates face the same frozen requirements. The independent evaluator checks the reported bug, timezone regressions, and test integrity. Actual command output and evaluator hashes remain inspectable. Passing this fixture supports these implemented requirements; it does not establish general coding-agent reliability.

## 130–150 seconds

The supporting negative case weakens a visible assertion instead of repairing the parser. Its final visible command exits zero. Yet the protected evaluator reports test tampering and rejects it, with 25 of 28 implemented checks passing. This bad edit is explicitly injected, not attributed to Meta.

## 150–170 seconds

A fresh restart without advice also passed 28 of 28 implemented checks. Both arms had the same twelve-call cap, including the attached proposal for the repair arm. Advice used more tokens and more total time here, with no checked outcome advantage. Monetary cost remains unknown.

## 170–180 seconds

Meta proposes repairs. Time Machine makes them executable and independently testable, preserving every original and alternative attempt.

## Upload and access

The repository contains the MP4 so it can be downloaded or linked independently
of the local app. Once the repository is public, its
[direct MP4 URL](https://raw.githubusercontent.com/Eswar-deep/agent-time-machine/main/docs/assets/agent-time-machine-demo.mp4)
can be opened without a GitHub login. Use a video upload or host accepted by the
actual submission form; the form's permitted mechanism has not been inspected.
A local video or GitHub push does not confirm a submitted entry.

Review the complete video before submitting. It includes saved real results, with
credentials and unrelated browser content excluded; public source and evidence
retain third-party notices and prototype limits.
