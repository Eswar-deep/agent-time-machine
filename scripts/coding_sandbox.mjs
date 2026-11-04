#!/usr/bin/env node
/** Trusted host launcher. Candidate JavaScript runs only inside QuickJS WASM. */
import { performance } from 'node:perf_hooks';

const VERSION = '0.32.0';
const MAX_REQUEST_BYTES = 512 * 1024;
const MAX_SOURCE_BYTES = 64 * 1024;
const MAX_FILES = 64;
const MAX_CASES = 64;
const MAX_INPUT_BYTES = 4096;
const MAX_RESPONSE_BYTES = 512 * 1024;
const runtimeDescription = {
  name: 'quickjs-emscripten',
  version: VERSION,
  boundary: 'WebAssembly; no guest filesystem, network, environment, or host callbacks',
};

class RequestError extends Error {}

function integerLimit(value, fallback, minimum, maximum) {
  if (value === undefined) return fallback;
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new RequestError(`Limit must be an integer between ${minimum} and ${maximum}.`);
  }
  return value;
}

function validateRequest(request) {
  if (!request || typeof request !== 'object' || Array.isArray(request)) {
    throw new RequestError('Expected a JSON request object.');
  }
  if (!['visible', 'probe'].includes(request.operation)) {
    throw new RequestError('Unsupported operation; use visible or probe.');
  }
  const files = request.files;
  if (!files || typeof files !== 'object' || Array.isArray(files)) {
    throw new RequestError('files must be an object containing source text.');
  }
  const entries = Object.entries(files);
  if (entries.length > MAX_FILES) throw new RequestError('Too many files.');
  for (const [name, source] of entries) {
    if (name.length > 256 || typeof source !== 'string' || Buffer.byteLength(source, 'utf8') > MAX_SOURCE_BYTES) {
      throw new RequestError('File names must be bounded strings and each source must be at most 64 KiB.');
    }
  }
  if (!Object.hasOwn(files, 'timestamp_parser.js')) {
    throw new RequestError('Missing timestamp_parser.js.');
  }
  if (request.operation === 'visible' && !Object.hasOwn(files, 'test_timestamp_parser.js')) {
    throw new RequestError('Missing test_timestamp_parser.js.');
  }
  const requestedLimits = request.limits ?? {};
  if (typeof requestedLimits !== 'object' || Array.isArray(requestedLimits)) {
    throw new RequestError('limits must be an object.');
  }
  const limits = {
    memory_bytes: integerLimit(requestedLimits.memory_bytes, 16 * 1024 * 1024, 8 * 1024 * 1024, 32 * 1024 * 1024),
    guest_timeout_ms: integerLimit(requestedLimits.guest_timeout_ms, 250, 10, 1000),
    output_chars: integerLimit(requestedLimits.output_chars, 16 * 1024, 256, 32 * 1024),
  };
  const cases = request.cases ?? [];
  if (!Array.isArray(cases) || cases.length > MAX_CASES) throw new RequestError('cases must contain at most 64 entries.');
  if (request.operation === 'probe' && cases.length === 0) throw new RequestError('probe requires at least one case.');
  const ids = new Set();
  for (const testCase of cases) {
    if (!testCase || typeof testCase !== 'object' || Array.isArray(testCase)
      || typeof testCase.id !== 'string' || testCase.id.length > 128 || ids.has(testCase.id)
      || !Object.hasOwn(testCase, 'input')) {
      throw new RequestError('Each case needs a unique bounded id and a JSON input.');
    }
    if (Buffer.byteLength(JSON.stringify(testCase.input), 'utf8') > MAX_INPUT_BYTES) {
      throw new RequestError('Each case input must be at most 4 KiB.');
    }
    ids.add(testCase.id);
  }
  return { operation: request.operation, files, cases, limits };
}

async function readRequest() {
  const chunks = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    length += chunk.length;
    if (length > MAX_REQUEST_BYTES) throw new RequestError('Request exceeds 512 KiB.');
    chunks.push(chunk);
  }
  return validateRequest(JSON.parse(Buffer.concat(chunks).toString('utf8')));
}

function createGuest(QuickJS, limits) {
  const runtime = QuickJS.newRuntime();
  runtime.setMemoryLimit(limits.memory_bytes);
  runtime.setMaxStackSize(256 * 1024);
  const deadline = performance.now() + limits.guest_timeout_ms;
  let timedOut = false;
  runtime.setInterruptHandler(() => {
    if (performance.now() >= deadline) timedOut = true;
    return timedOut;
  });
  const vm = runtime.newContext();
  return {
    vm,
    timedOut: () => timedOut,
    dispose() {
      vm.dispose();
      runtime.dispose();
    },
  };
}

function guestError(vm, handle, maxChars = 1024) {
  if (vm.typeof(handle) === 'string') return vm.getString(handle).slice(0, maxChars);
  // Only the message property is inspected; arbitrary objects are never dumped
  // into the host and no guest serialization determines protected observations.
  let message;
  try {
    message = vm.getProp(handle, 'message');
    if (vm.typeof(message) === 'string') return vm.getString(message).slice(0, maxChars);
  } catch {
    // A malicious getter is still guest execution, governed by the deadline.
  } finally {
    message?.dispose();
  }
  return 'Guest threw an exception.';
}

function evaluate(vm, code, filename) {
  const result = vm.evalCode(code, filename, { type: 'global' });
  if (result.error) {
    let message;
    try {
      message = guestError(vm, result.error);
    } finally {
      result.error.dispose();
    }
    throw new Error(message);
  }
  return result.value;
}

function loadCandidate(vm, source) {
  // The module object is created inside the guest. No Node module loader exists.
  evaluate(vm, 'globalThis.module = { exports: {} }; globalThis.exports = module.exports;', 'bootstrap.js').dispose();
  evaluate(vm, source, 'timestamp_parser.js').dispose();
  const moduleHandle = vm.getProp(vm.global, 'module');
  try {
    const exportsHandle = vm.getProp(moduleHandle, 'exports');
    try {
      const parser = vm.getProp(exportsHandle, 'parseTimestamp');
      if (vm.typeof(parser) !== 'function') {
        parser.dispose();
        throw new Error('timestamp_parser.js must export parseTimestamp.');
      }
      return parser;
    } finally {
      exportsHandle.dispose();
    }
  } finally {
    moduleHandle.dispose();
  }
}

function primitiveObservation(vm, handle) {
  const type = vm.typeof(handle);
  if (vm.eq(handle, vm.null)) return { returned_type: 'null', value: null };
  if (type === 'number') {
    const value = vm.getNumber(handle);
    return Number.isFinite(value)
      ? { returned_type: type, value }
      : { returned_type: type, value: null, non_finite: String(value) };
  }
  if (type === 'string') {
    const value = vm.getString(handle);
    if (value.length > 4096) throw new Error('Returned string exceeds 4096 characters.');
    return { returned_type: type, value };
  }
  if (type === 'boolean') return { returned_type: type, value: vm.eq(handle, vm.true) };
  // Objects, promises, functions, symbols and bigints cannot smuggle an
  // assertion result or a host object across the observation boundary.
  return { returned_type: type, value: null };
}

function probeCase(QuickJS, request, testCase) {
  const guest = createGuest(QuickJS, request.limits);
  const { vm } = guest;
  let input;
  let parser;
  let result;
  let observation;
  let phase = 'load';
  try {
    // Parse input before candidate code can modify JSON.parse or builtins.
    input = evaluate(vm, `JSON.parse(${JSON.stringify(JSON.stringify(testCase.input))})`, 'input.json');
    parser = loadCandidate(vm, request.files['timestamp_parser.js']);
    phase = 'invoke';
    result = vm.callFunction(parser, vm.undefined, input);
    if (result.error) {
      observation = { id: testCase.id, returned_type: 'undefined', value: null, threw: true, error: guestError(vm, result.error), error_phase: 'invoke' };
    } else {
      phase = 'result';
      observation = { id: testCase.id, ...primitiveObservation(vm, result.value), threw: false, error: null, error_phase: null };
    }
  } catch (error) {
    observation = { id: testCase.id, returned_type: 'undefined', value: null, threw: true, error: String(error.message).slice(0, 1024), error_phase: phase };
  } finally {
    result?.error?.dispose();
    result?.value?.dispose();
    parser?.dispose();
    input?.dispose();
    observation = { ...observation, timed_out: guest.timedOut() };
    guest.dispose();
  }
  return observation;
}

function visibleHarness(outputLimit) {
  return `(() => {
    const stringify = JSON.stringify;
    const text = String;
    const same = Object.is;
    const ErrorType = Error;
    const append = Function.call.bind(Array.prototype.push);
    const lines = [];
    const tests = [];
    let characters = 0;
    const limit = ${outputLimit};
    function printable(value) {
      try { return text(value).slice(0, 512); } catch { return '[unprintable]'; }
    }
    function log(...values) {
      if (characters >= limit) return;
      let line = '';
      for (let index = 0; index < values.length && line.length < limit; index++) {
        line += (index ? ' ' : '') + printable(values[index]);
      }
      line = (line + '\\n').slice(0, limit - characters);
      characters += line.length;
      append(lines, line);
    }
    globalThis.console = { log, info: log, warn: log, error: log };
    globalThis.assertEqual = function(actual, expected) {
      if (!same(actual, expected)) throw new ErrorType('Expected ' + printable(expected) + ', received ' + printable(actual));
    };
    globalThis.assertThrows = function(fn) {
      if (typeof fn !== 'function') throw new ErrorType('assertThrows expects a function.');
      try { fn(); } catch { return; }
      throw new ErrorType('Expected function to throw.');
    };
    globalThis.test = function(name, fn) {
      if (tests.length >= 100) throw new ErrorType('At most 100 visible tests are allowed.');
      const label = printable(name).slice(0, 200);
      try {
        const returned = fn();
        if (returned && typeof returned.then === 'function') throw new ErrorType('Visible tests must be synchronous.');
        append(tests, { name: label, passed: true, error: null });
        log('PASS ' + label);
      } catch (error) {
        let message = 'Guest assertion failed.';
        try { message = printable(error && error.message !== undefined ? error.message : error); } catch {}
        append(tests, { name: label, passed: false, error: message });
        log('FAIL ' + label + ': ' + message);
      }
    };
    return () => stringify({ stdout: lines.join(''), tests });
  })()`;
}

function runVisible(QuickJS, request) {
  const guest = createGuest(QuickJS, request.limits);
  const { vm } = guest;
  let reportGetter;
  let parser;
  let report;
  let failure = '';
  let reportData = { stdout: '', tests: [] };
  try {
    reportGetter = evaluate(vm, visibleHarness(request.limits.output_chars), 'visible-harness.js');
    parser = loadCandidate(vm, request.files['timestamp_parser.js']);
    // Tests call the exported parser without require(), which is absent.
    vm.setProp(vm.global, 'parseTimestamp', parser);
    evaluate(vm, request.files['test_timestamp_parser.js'], 'test_timestamp_parser.js').dispose();
  } catch (error) {
    failure = String(error.message).slice(0, 1024);
  }
  try {
    if (reportGetter && !guest.timedOut()) {
      report = vm.callFunction(reportGetter, vm.undefined);
      if (report.error) throw new Error(guestError(vm, report.error));
      if (vm.typeof(report.value) !== 'string') throw new Error('Visible test report was not a string.');
      const serialized = vm.getString(report.value);
      if (serialized.length > 96 * 1024) throw new Error('Visible test report exceeded its limit.');
      const parsed = JSON.parse(serialized);
      if (typeof parsed.stdout !== 'string' || !Array.isArray(parsed.tests) || parsed.tests.length > 100) {
        throw new Error('Visible test report had an invalid shape.');
      }
      reportData = {
        stdout: parsed.stdout.slice(0, request.limits.output_chars),
        tests: parsed.tests.map((item) => ({
          name: String(item.name).slice(0, 200),
          passed: item.passed === true,
          error: item.error == null ? null : String(item.error).slice(0, 512),
        })),
      };
    }
  } catch (error) {
    failure ||= String(error.message).slice(0, 1024);
  } finally {
    report?.error?.dispose();
    report?.value?.dispose();
    parser?.dispose();
    reportGetter?.dispose();
  }
  const timedOut = guest.timedOut();
  guest.dispose();
  const passed = !failure && !timedOut && reportData.tests.length > 0 && reportData.tests.every((item) => item.passed);
  return {
    exit_code: timedOut ? 124 : passed ? 0 : 1,
    stdout: reportData.stdout,
    stderr: timedOut ? 'Guest execution deadline exceeded.' : failure,
    timed_out: timedOut,
    tests: reportData.tests,
  };
}

async function main() {
  const started = performance.now();
  let operation = 'invalid';
  let envelope;
  try {
    const request = await readRequest();
    operation = request.operation;
    let QuickJS;
    try {
      const library = await import('quickjs-emscripten');
      QuickJS = await library.getQuickJS();
    } catch {
      throw new RequestError('QuickJS WASM runtime unavailable. Install the pinned npm dependencies; execution is disabled.');
    }
    if (request.operation === 'visible') {
      envelope = runVisible(QuickJS, request);
    } else {
      const observations = request.cases.map((testCase) => probeCase(QuickJS, request, testCase));
      const timedOut = observations.some((observation) => observation.timed_out);
      envelope = {
        exit_code: timedOut ? 124 : 0,
        stdout: '',
        stderr: timedOut ? 'One or more guest execution deadlines were exceeded.' : '',
        timed_out: timedOut,
        observations,
      };
    }
  } catch (error) {
    envelope = {
      exit_code: 2,
      stdout: '',
      stderr: String(error.message ?? 'Sandbox launcher failed.').slice(0, 1024),
      timed_out: false,
    };
  }
  const response = {
    runtime: runtimeDescription,
    // Operation is selected through stdin, never interpreted as a shell command.
    command: ['node', 'scripts/coding_sandbox.mjs'],
    operation,
    ...envelope,
    duration_ms: Math.round((performance.now() - started) * 1000) / 1000,
  };
  let serialized = JSON.stringify(response);
  if (Buffer.byteLength(serialized, 'utf8') > MAX_RESPONSE_BYTES) {
    serialized = JSON.stringify({
      runtime: runtimeDescription,
      command: ['node', 'scripts/coding_sandbox.mjs'],
      operation,
      exit_code: 2,
      stdout: '',
      stderr: 'Sandbox response exceeded 512 KiB; no observations accepted.',
      timed_out: false,
    });
    process.exitCode = 2;
  } else {
    process.exitCode = response.exit_code ?? 2;
  }
  process.stdout.write(`${serialized}\n`);
}

await main();
