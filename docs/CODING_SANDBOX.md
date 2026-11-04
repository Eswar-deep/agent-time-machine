# Coding execution boundary

The coding fixture is JavaScript executed inside QuickJS compiled to WebAssembly,
using the pinned `quickjs-emscripten@0.32.0` package. The trusted
[launcher](../scripts/coding_sandbox.mjs) runs in Node; candidate source is passed
only to the QuickJS interpreter. It is never evaluated by Node, `node:vm`, a
shell, or an operating-system Python interpreter.

## Capabilities and limits

The guest has no host callbacks, module loader, filesystem, network, process,
environment, or native-library bridge. `module.exports` is an ordinary guest
object, not Node's module system. Guest `console`, `test`, `assertEqual`, and
`assertThrows` are implemented entirely inside the guest. They do not expose
host functions. Snapshot files other than the two fixture entrypoints remain
data and are never loaded as executable modules.

Requests are capped at 512 KiB, 64 files, 64 KiB per source, 64 probe cases, and
4 KiB per case input. Each runtime has a 16 MiB allocation limit and a 256 KiB
stack limit by default. A guest interrupt deadline defaults to 250 ms. Callers
may select bounded values: 8–32 MiB memory, 10–1000 ms per guest, and 256–32768
characters of visible output. Each protected case gets a fresh QuickJS runtime
and context. Guest result objects are never deserialized as protected verdicts.

The Python caller must additionally enforce a hard subprocess timeout and a
bounded output envelope, supply a minimal environment without application
secrets or Node startup overrides, and use an absolute trusted launcher path.
The subprocess watchdog handles runtime stalls where an interrupt callback does
not run. A separate working directory is useful for snapshot organization; it is
not the security boundary. WASM and the absence of guest capabilities provide
that boundary.

## Protocol

Send one JSON object to standard input:

```json
{
  "operation": "probe",
  "files": {
    "timestamp_parser.js": "module.exports = { parseTimestamp }; function parseTimestamp(value) { return Date.parse(value); }"
  },
  "cases": [{ "id": "example", "input": "2026-11-02T10:30:00+05:30" }],
  "limits": { "memory_bytes": 16777216, "guest_timeout_ms": 250, "output_chars": 16384 }
}
```

`probe` invokes the exported `parseTimestamp` separately for each input and
returns observations containing `id`, `returned_type`, `value`, `threw`, `error`,
`timed_out`, and `error_phase`. Only an `invoke` error can represent an expected
parser rejection; `load` or `result` errors indicate a broken candidate or
unsupported return value. Non-finite numbers have a `non_finite` label and a null JSON
value. Other non-JSON primitive/object results have their type reported and a
null value. No pass/fail decision is made. Expected values and protected
assertions remain with the Python caller and are never sent into the guest.

`visible` additionally requires `test_timestamp_parser.js`. That test file can
call the global exported `parseTimestamp` and synchronous `test`, `assertEqual`,
and `assertThrows` functions. It can use guest `console.log`. `require` and
`import` are unavailable. The launcher returns captured console output and local
test results. These results are explicitly untrusted: candidate code or tests
can weaken assertions, replace guest globals, or otherwise manufacture a green
local result. Only the independent protected checks decide acceptance.

Both operations return a single JSON envelope with `runtime`, `command`,
`operation`, `exit_code`, `stdout`, `stderr`, `timed_out`, and `duration_ms`.
Visible evaluation adds `tests`; probing adds `observations`. Exit code 0 means
local tests passed for `visible`, or observations were collected for `probe`.
It does **not** mean a proposed patch passed the protected evaluator. Exit code
124 indicates a guest deadline, 1 a visible test failure, and 2 an invalid request,
unavailable runtime, or launcher failure. Missing dependencies fail closed.
The complete JSON response is capped at 512 KiB; exceeding that cap produces a
failure envelope with no observations.

## Trust and limitations

Freeze task requirements, evaluator cases, and original test hashes before
evaluating branches. Store these outside candidate snapshots. Compare observed
primitive values in trusted host code. A changed or removed local test must be
reported independently from its local exit code. Never trust stdout or a guest
claim that a repair passed. Maintain failed branches and actual execution logs.

This implementation confines a small synchronous JavaScript fixture; it does
not provide a general shell, npm installer, Python environment, browser, or
arbitrary repository build service. Runtime allocation limits do not cap all
Node process overhead. The runtime and trusted launcher are part of the trusted
computing base. The QuickJS Emscripten maintainer states the package has not been
security audited. The implementation does not claim immunity to unknown engine
or WebAssembly runtime vulnerabilities.

Primary references:

- [QuickJS Emscripten package](https://www.npmjs.com/package/quickjs-emscripten)
- [Runtime limits API](https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten/classes/QuickJSRuntime.md)
- [Context and value APIs](https://github.com/justjake/quickjs-emscripten/blob/main/doc/quickjs-emscripten/classes/QuickJSContext.md)
- [Maintainer security statement](https://github.com/justjake/quickjs-emscripten#status--roadmap)
