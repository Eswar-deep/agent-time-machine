# Frozen date-parser coding experiment

This small dependency-free JavaScript repository supplies the coding demo. Its
requirements and acceptance checks are defined before any candidate is evaluated.
It is a synthetic development fixture, not a benchmark or evidence of general
coding-agent recovery.

- [candidate/](candidate/) is the only initial working tree supplied to a coding
  agent. Its visible test reproduces the reported bug.
- [requirements.json](requirements.json) freezes the task and acceptance policy.
- [protected/acceptance.json](protected/acceptance.json) contains 25 frozen input
  and expected-outcome cases. The host evaluator compares actual isolated guest
  outputs against these expectations. It is **not candidate context and must
  never be sent to a model or loaded into the guest**.
- [manifest.json](manifest.json) freezes normalized-source SHA-256 fingerprints.
  Validate those fingerprints before evaluation and include them in checkpoints.
- [patches/](patches/) contains full-file replacement interventions and readable
  unified diffs. They are fixture assets, not model output. In particular, the
  correct example patch must not be supplied as model context.

The execution coordinator must run candidate code only in the QuickJS WebAssembly
guest, with no host filesystem, network, or process bridges, and enforce memory
and execution limits. These files do not themselves create a sandbox. The trusted
Node launcher must never evaluate candidate source in Node itself. Keep evaluator
expectations outside the guest and verify source hashes independently of claims
made by candidate code or its visible tests.

The intended matrix below is a design expectation, **not an execution result**:

| Candidate | Visible checks | Reported bug | Offset regressions | Test integrity |
| --- | --- | --- | --- | --- |
| Initial repository | Fails | Fails | Passes | Passes |
| Injected original patch | Passes | Passes | Fails | Passes |
| Manually supplied alternative | Passes | Passes | Passes | Passes |
| Injected misleading green test | Passes | Fails | Passes | Fails |

The deliberately injected original drops the subtraction of `offsetMinutes`,
which treats a wall-clock time as UTC and changes its instant.
The alternative accepts `Z` without changing existing explicit-offset behavior.
The misleading candidate changes the reported-bug test to expect the exception
instead of fixing the parser. Independent frozen checks reject that change.

Each patch JSON uses `files` as a mapping of candidate-relative paths to full
UTF-8 contents. Apply it to a fresh restored checkpoint; do not apply the next
candidate on top of a previous failed candidate. `provenance` and `label` must be
preserved in the run record. Diff files compare each patch against the initial
candidate tree. The visible test file calls the guest-only `test(name, fn)`,
`assertEqual(actual, expected)`, and `assertThrows(fn)` harness. The parser exports
`module.exports = { parseTimestamp }` and returns a UTC ISO string with
milliseconds. Report actual check outcomes and command output.

The manifest marks `notes/reproduction.txt` as untracked **in the simulated
candidate repository**, even though its fixture source is checked into this app.
Snapshot it along with tracked files, conversation context, and execution
configuration. Parent and sibling snapshots must remain unchanged after a fork.
