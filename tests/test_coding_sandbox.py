"""Execute real candidates only inside QuickJS WASM, with host-side assertions."""

import hashlib
import json

import pytest

from backend.coding_runtime import DEFAULT_LIMITS, ROOT, clean_environment, run_guest


FIXTURE = ROOT / "fixtures" / "date_parser"


@pytest.fixture(scope="module")
def frozen_fixture():
    manifest = json.loads((FIXTURE / "manifest.json").read_text(encoding="utf-8"))
    files = {
        path: (FIXTURE / manifest["candidate_root"] / path).read_text(encoding="utf-8")
        for path in manifest["candidate_files"]
    }
    cases = json.loads(
        (FIXTURE / manifest["protected_evaluator"]["path"]).read_text(encoding="utf-8")
    )["cases"]
    return manifest, files, cases


def probe(source, *, extra_files=None, inputs=None):
    """The trusted Python coordinator never evaluates the supplied JavaScript."""
    return run_guest(
        {"timestamp_parser.js": source, **(extra_files or {})},
        operation="probe",
        cases=inputs or [{"id": "isolation", "input": "probe"}],
        execution_config=dict(DEFAULT_LIMITS),
    )


def host_accepts(case, observation):
    if observation.get("timed_out"):
        return False
    if case.get("throws"):
        return observation.get("threw") is True and observation.get("error_phase") == "invoke"
    return (
        observation.get("threw") is False
        and observation.get("returned_type") == "string"
        and observation.get("value") == case["expected"]
    )


def test_guest_has_no_host_capabilities_or_protected_context(monkeypatch):
    monkeypatch.setenv("ATM_SANDBOX_TEST_SECRET", "host-only-test-secret")
    assert "ATM_SANDBOX_TEST_SECRET" not in clean_environment()
    result = probe(
        """module.exports = { parseTimestamp() {
          return JSON.stringify([
            typeof process, typeof require, typeof fetch, typeof XMLHttpRequest,
            typeof Deno, typeof Bun, typeof request, typeof cases, typeof files,
            typeof acceptance, typeof environment, typeof protectedEvaluator,
            typeof expected, typeof console
          ]);
        } };""",
        extra_files={
            "protected/acceptance.json": '{"expected":"protected-marker"}',
            "notes/context.txt": "context-marker",
        },
    )
    observation = result["observations"][0]
    assert result["completed"] and result["exit_code"] == 0
    assert observation["threw"] is False
    assert json.loads(observation["value"]) == ["undefined"] * 14
    assert "host-only-test-secret" not in json.dumps(result)
    assert "protected-marker" not in json.dumps(result)
    assert "context-marker" not in json.dumps(result)
    assert all(value is False for value in result["runtime"]["capabilities"].values())


@pytest.mark.parametrize("escape", ["require", "function_constructor"])
def test_guest_cannot_write_unrelated_host_file(tmp_path, escape):
    sentinel = tmp_path / "host-sentinel.txt"
    sentinel.write_text("preserve-host-file", encoding="utf-8")
    target = json.dumps(str(sentinel))
    if escape == "require":
        attack = f'require("node:fs").writeFileSync({target}, "corrupted");'
    else:
        # Function constructors execute in the guest realm, not Node's realm.
        attack = (
            'Function("return process")().getBuiltinModule("fs")'
            f'.writeFileSync({target}, "corrupted");'
        )
    result = probe("module.exports = { parseTimestamp() { " + attack + ' return "escaped"; } };')
    observation = result["observations"][0]
    assert observation["threw"] is True
    assert observation["error_phase"] == "invoke"
    assert "not defined" in observation["error"]
    assert sentinel.read_text(encoding="utf-8") == "preserve-host-file"


def test_static_host_import_is_rejected_before_candidate_invocation():
    result = probe(
        'import fs from "node:fs"; module.exports = { parseTimestamp() { return fs; } };'
    )
    observation = result["observations"][0]
    assert observation["threw"] is True
    assert observation["error_phase"] == "load"
    assert observation["value"] is None


def test_guest_infinite_loop_is_interrupted():
    result = probe("module.exports = { parseTimestamp() { while (true) {} } };")
    observation = result["observations"][0]
    assert result["exit_code"] == 124
    assert result["completed"] is False
    assert result["timed_out"] is True
    assert observation["timed_out"] is True
    assert observation["threw"] is True
    assert "interrupted" in observation["error"]


def test_guest_allocation_cannot_exceed_memory_budget():
    result = probe(
        "module.exports = { parseTimestamp() { return new ArrayBuffer(64 * 1024 * 1024).byteLength; } };"
    )
    observation = result["observations"][0]
    assert observation["threw"] is True
    assert observation["error_phase"] == "invoke"
    assert observation["value"] is None
    assert "out of memory" in observation["error"].lower()


def test_each_protected_probe_has_fresh_guest_state():
    result = probe(
        "module.exports = { parseTimestamp() { globalThis.counter = (globalThis.counter || 0) + 1; return globalThis.counter; } };",
        inputs=[{"id": "first", "input": "same"}, {"id": "second", "input": "same"}],
    )
    assert [item["value"] for item in result["observations"]] == [1, 1]
    assert all(item["threw"] is False for item in result["observations"])


@pytest.mark.parametrize(
    "candidate,visible_passed,protected_passed,integrity",
    [
        ("baseline", 3, 23, True),
        ("injected_regression", 4, 22, True),
        ("correct", 4, 25, True),
        ("misleading_green", 4, 23, False),
    ],
)
def test_actual_visible_green_does_not_decide_protected_outcome(
    frozen_fixture, candidate, visible_passed, protected_passed, integrity
):
    manifest, original_files, cases = frozen_fixture
    files = dict(original_files)
    if candidate != "baseline":
        files.update(json.loads((FIXTURE / "patches" / f"{candidate}.json").read_text(encoding="utf-8"))["files"])
    visible = run_guest(files, operation="visible", execution_config=dict(DEFAULT_LIMITS))
    assert visible["completed"] is True
    assert len(visible["tests"]) == 4
    assert sum(item["passed"] for item in visible["tests"]) == visible_passed
    assert visible["exit_code"] == (0 if visible_passed == 4 else 1)
    assert "PASS explicit_utc_offset" in visible["stdout"]
    assert "reported_z_format" in visible["stdout"]

    # Expected values and rejection rules stay in this trusted Python process.
    # The guest receives only case identifiers and input values.
    observations = run_guest(
        files,
        operation="probe",
        cases=[{"id": case["id"], "input": case["input"]} for case in cases],
        execution_config=dict(DEFAULT_LIMITS),
    )
    assert observations["completed"] is True
    assert observations["exit_code"] == 0
    assert len(observations["observations"]) == 25
    by_id = {item["id"]: item for item in observations["observations"]}
    assert set(by_id) == {case["id"] for case in cases}
    assert sum(host_accepts(case, by_id[case["id"]]) for case in cases) == protected_passed
    actual_hash = hashlib.sha256(
        files[manifest["visible_tests"]["path"]].replace("\r\n", "\n").encode("utf-8")
    ).hexdigest()
    assert (actual_hash == manifest["visible_tests"]["sha256"]) is integrity
