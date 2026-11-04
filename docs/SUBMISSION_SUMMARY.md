# Hackathon project summary

Agent Time Machine is a local debugger for coding agents. It records actions and
checkpoints so developers can test an alternative from a specific point in a run
and compare the resulting code and test results.

## Meta integration

The recorded experiment uses **Muse Spark 1.3** through the **Meta Model API**
and its Chat Completions endpoint. The model analyzes the failed execution,
cites relevant events, selects a checkpoint, and proposes a code change.
After the developer reviews the proposal, the runner applies it in a separate
branch and requests fresh continuation decisions from the model.

The protected evaluator uses frozen behavior and test-integrity checks to judge
the executed result. Its expected answers are outside the candidate workspace and
model inputs.

## Demonstration result

The Meta-guided branch and the restart without advice both passed **28/28** checks.
The guided branch used **23,834 tokens** and took **27.57 seconds**, including the
proposal. The restart used **14,450 tokens** and took **15.31 seconds**. The demo
also shows how the evaluator rejects an injected edit that weakens a visible test.
[Validation](VALIDATION.md) · [Recorded demo](VIDEO_SCRIPT.md)

## Implementation

The prototype uses Python, FastAPI, and SQLite for execution and persistence, React
and TypeScript for the debugger, and QuickJS WebAssembly for the candidate JavaScript.
pytest and Playwright cover backend and browser behavior. Live requests in the
recorded workflow go directly to Meta.
