# Third-party software

## QuickJS Emscripten

- Runtime package: [quickjs-emscripten](https://www.npmjs.com/package/quickjs-emscripten),
  pinned to `0.32.0` in the JavaScript lockfile.
- Source: https://github.com/justjake/quickjs-emscripten
- QuickJS: https://bellard.org/quickjs/
- License: MIT; dependency distributions retain their own license files.

The trusted app launcher invokes QuickJS compiled to WebAssembly. Candidate
source is interpreted only in the guest. No Node, filesystem, network, process,
or environment bridge is exposed. Runtime artifacts and launcher identity are
included in coding compatibility metadata. The package maintainer notes that it
has not been security audited; see [execution boundaries](docs/CODING_SANDBOX.md).

## tau2-bench — Sierra Research

- Repository: https://github.com/sierra-research/tau2-bench
- Pinned commit: `122e2432b82d740e8f313f46f0a071729c404f39`
- License: MIT; retained verbatim in [vendor/tau2/LICENSE](vendor/tau2/LICENSE).
- Source files and SHA-256 hashes:
  [vendor/tau2/PROVENANCE.json](vendor/tau2/PROVENANCE.json).

Fourteen upstream files are retained byte-for-byte: retail tools, data models,
support modules, policy, and license. Four package entry points are minimal app
glue rather than upstream initializers; they avoid eager imports of the full
benchmark's runner, voice stack, and LLM framework. No retail tool or data-model
behavior was rewritten. The full upstream project requires Python 3.12+; only
this vendored subset is exercised with Python 3.11 here.

The upstream Tool implementation identifies its adaptation from
[BerriAI/APPL](https://github.com/BerriAI/appl/blob/main/appl/core/tool.py).
That notice is preserved in the source.

Custom synthetic customer/order fixtures and scoped outcome checks are app
code. No upstream benchmark task set, gold answers, or evaluation results are
bundled. The included retail policy provides provenance; candidate prompts use
an explicitly narrower custom upfront-consent policy. These are not official
tau2-bench scores.

The separate Agent Time Machine Validation ZIP described in the handoff was
unavailable. Its third-party notices and research results were not inspected
or copied.

## Application dependencies

The source editor uses [CodeMirror 6](https://codemirror.net/) and its JavaScript
language and One Dark theme packages, under the MIT license. Package versions
are recorded in the JavaScript lockfile; installed packages retain their license
files. The editor displays and edits text; it does not execute candidate source.

React and React DOM, TypeScript, Vite, Lucide, Playwright, FastAPI, Uvicorn,
Pydantic, httpx, pytest, and supporting packages retain their own licenses in
their installed distributions. JavaScript versions are locked in
[package-lock.json](package-lock.json); Python versions are recorded in
[requirements.lock](requirements.lock).

