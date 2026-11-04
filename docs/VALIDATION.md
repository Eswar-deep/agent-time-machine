# Validation

[Project overview](../README.md) · [Walkthrough](DEMO.md) · [Sandbox](CODING_SANDBOX.md)

## Automated checks

The playground changes passed **112 backend tests** and **14 Chromium tests**.
The production build passed. These checks cover sandbox execution, checkpoint
restoration, protected verification, tool restrictions, API failures, and the
debugger and playground workflows. Tests simulate provider responses where needed.

```bash
python -m pytest tests -q
npm run build
npm run test:ui
```

Run the Python command from the configured virtual environment. Browser tests use
Edge by default on Windows. To use Playwright's Chromium, run
`npx playwright install chromium` and set `PLAYWRIGHT_CHANNEL=bundled`.
When port 8000 is free, Playwright starts a server using a separate test database.

## Fixture outcomes

Final scoring combines 25 protected behavior cases with checks for test integrity,
visible command success, and execution completion.

| Candidate | Visible tests | Protected behavior | Test integrity |
| --- | ---: | ---: | --- |
| Initial parser | 3/4 | 23/25 | Pass |
| Injected offset regression | 4/4 | 22/25 | Pass |
| Supplied manual correction | 4/4 | 25/25 | Pass |
| Injected weakened test | 4/4 | 23/25 | Fail |

The weakened-test case demonstrates why the evaluator checks the visible test
file separately. Changing an assertion can turn the local command green while
the behavior remains incorrect.

## Recorded live original

A November 3, 2026 run of Muse Spark 1.3 fixed the bundled parser directly.
It passed **28/28** checks, used **9 model calls** and **30,952 tokens**, and
took approximately **40.6 seconds**. The run changed only the parser and passed
the test-integrity check. Monetary cost was unavailable.

## Meta repair and restart

A separate November 3 experiment started from an injected regression. The
repair proposer cited four recorded events and selected the checkpoint before
the edit. The debugger applied the exact proposal and used fresh Meta calls to
continue. A second branch restarted from the same checkpoint without advice.

| Run | Final checks | Calls | Tokens | Total time |
| --- | ---: | ---: | ---: | ---: |
| Injected original | 25/28 | 0 | 0 | 2.31 s |
| Meta proposal and continuation | 28/28 | 3 | 23,834 | 27.57 s |
| Restart without advice | 28/28 | 3 | 14,450 | 15.31 s |
| Injected weakened test | 25/28 | 0 | 0 | 1.09 s |

Both live branches had a 12-call allowance. The repair totals include one
proposal call and two continuation calls. Proposal generation took 18.13 seconds.
No provider retries were recorded. Monetary cost was unavailable.

The restart reached the same checked outcome with fewer tokens and less time on
this fixture. The recorded run supports the repair workflow and its measured
tradeoff on this example. The cases are public development fixtures, so the
results do not estimate recovery rates on unseen tasks.

The evidence package contains the executed revision, model configuration,
checkpoint and branch lineage, command results, and file checksums. [Evidence
guide](../evidence/meta-repair-2026-11-03/README.md) · [Manifest](../evidence/meta-repair-2026-11-03/manifest.json)
