# Agent Time Machine

Agent Time Machine is a local debugger and test playground for AI agents. It records tool
actions, saves checkpoints, and lets you try a different action from the same point in a
run. The debugger compares code changes and test results across branches.

The main fixture is a JavaScript timestamp parser. A scripted edit fixes the reported
input while introducing a timezone regression. The visible tests pass, but independent
checks catch the regression. You can rewind the edit, try a replacement, and verify the
result in an isolated branch.

[Setup](docs/SETUP.md) · [Walkthrough](docs/DEMO.md) · [Recorded demo](docs/VIDEO_SCRIPT.md) · [Validation](docs/VALIDATION.md)

## Quick start

Use Python 3.11 or 3.12 and Node.js 22 or later. On macOS or Linux:

```bash
git clone https://github.com/Eswar-deep/agent-time-machine.git
cd agent-time-machine
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
npm ci
npm run build
.venv/bin/python -m backend
```

Open http://127.0.0.1:8000. The app starts with a saved deterministic run that uses zero
API calls. See [Windows setup](docs/SETUP.md#windows) for PowerShell commands.

## Workflows

| View | What you can do |
| --- | --- |
| **Debugger** | Inspect the tool timeline, restore a checkpoint, and run an alternative action. Compare the original and branch using code diffs, command output, and test results. |
| **Playground** | Run the deterministic demo and one live Meta agent on the same starting files and task. Compare checks passed, tool calls, elapsed time, tokens, and estimated cost when rates are configured. |
| **Run history** | Open saved attempts and export their events, checkpoints, and model usage. |

Set `MODEL_API_KEY`, `META_MODEL`, and a positive `ATM_LIVE_MAX_CALLS` in a local
`.env` file to enable live runs. One server-side key serves all live roles. The
[configuration reference](docs/SETUP.md#meta-configuration) lists the available limits.

In the debugger, **Analyze with Meta** sends selected execution evidence to the Meta Model
API. The model returns a proposed change and checkpoint for review. **Fork & execute
proposal** applies that change and runs a fresh continuation. Protected tests score the
executed result.

## Recorded results

On November 3, 2026, Muse Spark 1.3 produced a repair for the injected timezone regression.
The executed branch passed all 28 checks. Restarting from the same checkpoint without
repair advice also passed all 28 checks.

| Run | Checks passed | Model calls | Tokens | Total time |
| --- | ---: | ---: | ---: | ---: |
| Scripted regression | 25/28 | 0 | 0 | 2.31 s |
| Meta proposal and branch | 28/28 | 3 | 23,834 | 27.57 s |
| Restart without advice | 28/28 | 3 | 14,450 | 15.31 s |

The proposal row includes the cost in time and tokens of generating the proposal. This
fixture illustrates how to inspect and test a model-proposed repair. Both live approaches
passed, and the restart took less time. [Recorded evidence](evidence/meta-repair-2026-11-03/README.md)

## Design and scope

Checkpoints capture the supported file state, conversation prefix, pending action, and
configuration. QuickJS WebAssembly runs candidate JavaScript in isolation. The protected
evaluator holds expected results outside the candidate workspace and model inputs. SQLite
stores original runs, branches, and their evidence.

The prototype supports the bundled coding fixture and synthetic retail scenarios. It runs
on loopback. General repository execution, production hosting, and rollback of external
services are outside its scope.

- [Architecture](docs/ARCHITECTURE.md) and [coding sandbox](docs/CODING_SANDBOX.md)
- [Local API](docs/API.md) and [troubleshooting](docs/TROUBLESHOOTING.md)
- [MIT license](LICENSE) and [third-party notices](THIRD_PARTY.md)
