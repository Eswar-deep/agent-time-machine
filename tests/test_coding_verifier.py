"""Host-verifier checks use fabricated observations; no candidate code executes."""

import io
import json
import shutil

import pytest

from backend import coding_verify


@pytest.fixture
def fixture_data():
    root = coding_verify.FIXTURE_ROOT
    manifest = json.loads((root / "manifest.json").read_text(encoding="utf-8"))
    cases = json.loads((root / manifest["protected_evaluator"]["path"]).read_text(encoding="utf-8"))["cases"]
    files = {path: (root / "candidate" / path).read_text(encoding="utf-8") for path in manifest["candidate_files"]}
    observations = [{"id": case["id"], "returned_type": None if case.get("throws") else "string",
                     "value": case.get("expected"), "threw": bool(case.get("throws")),
                     "error": "RangeError: rejected" if case.get("throws") else None,
                     "error_phase": "invoke" if case.get("throws") else None, "timed_out": False} for case in cases]
    return files, cases, observations


def test_only_inputs_enter_guest_and_frozen_expectations_are_compared_on_host(monkeypatch, fixture_data):
    files, cases, observations = fixture_data

    def runner(candidate_files, *, cases, execution_config):
        assert candidate_files == files
        assert all(set(case) == {"id", "input"} for case in cases)
        assert execution_config == {"timeout_ms": 100}
        return {"observations": observations}

    monkeypatch.setattr(coding_verify, "_run_guest", runner)
    result = coding_verify.verify(files, {"timeout_ms": 100})
    assert result["completed"] and not result["tamper_detected"]
    assert len(result["checks"]) == len(cases) + 1
    assert all(check["status"] == "passed" for check in result["checks"])


def test_candidate_success_claim_cannot_override_wrong_observed_result(monkeypatch, fixture_data):
    files, _, observations = fixture_data
    observations[0]["value"] = "agent says this passed"
    monkeypatch.setattr(coding_verify, "_run_guest", lambda *args, **kwargs: {
        "observations": observations, "passed": True, "all_passed": True})
    result = coding_verify.verify(files)
    assert result["checks"][1]["status"] == "failed"
    assert '"value":"agent says this passed"' in result["report"]


@pytest.mark.parametrize("tamper", ["removed", "changed"])
def test_missing_or_weakened_tests_fail_even_when_observed_behavior_passes(monkeypatch, fixture_data, tamper):
    files, _, observations = fixture_data
    if tamper == "removed":
        files.pop("test_timestamp_parser.js")
    else:
        files["test_timestamp_parser.js"] = 'test("reported_z_format", () => {});\n'
    monkeypatch.setattr(coding_verify, "_run_guest", lambda *args, **kwargs: {"observations": observations})
    result = coding_verify.verify(files)
    assert result["tamper_detected"]
    assert result["checks"][0]["status"] == "failed"
    assert all(check["status"] == "passed" for check in result["checks"][1:])


@pytest.mark.parametrize("error_phase,timed_out", [("load", False), ("result", False), ("invoke", True)])
def test_rejection_requires_an_actual_invocation_error(monkeypatch, fixture_data, error_phase, timed_out):
    files, cases, observations = fixture_data
    index = next(index for index, case in enumerate(cases) if case.get("throws"))
    observations[index].update({"error_phase": error_phase, "timed_out": timed_out})
    monkeypatch.setattr(coding_verify, "_run_guest", lambda *args, **kwargs: {"observations": observations})
    result = coding_verify.verify(files)
    assert result["checks"][index + 1]["status"] == "failed"


def test_duplicate_and_missing_observations_cannot_complete_evaluation(monkeypatch, fixture_data):
    files, _, observations = fixture_data
    observations[-1] = dict(observations[0])
    monkeypatch.setattr(coding_verify, "_run_guest", lambda *args, **kwargs: {"observations": observations})
    result = coding_verify.verify(files)
    assert not result["completed"]
    assert result["checks"][1]["status"] == "failed"
    assert result["checks"][-1]["id"] == "evaluation_completed"


def test_modified_protected_fixture_fails_before_guest_execution(monkeypatch, fixture_data, tmp_path):
    files, _, _ = fixture_data
    fixture_copy = tmp_path / "fixture"
    shutil.copytree(coding_verify.FIXTURE_ROOT, fixture_copy)
    evaluator = fixture_copy / "protected" / "acceptance.json"
    evaluator.write_text(evaluator.read_text(encoding="utf-8") + " ", encoding="utf-8")
    monkeypatch.setattr(coding_verify, "FIXTURE_ROOT", fixture_copy)
    monkeypatch.setattr(coding_verify, "_run_guest", lambda *args, **kwargs: pytest.fail("Guest must not execute"))
    with pytest.raises(coding_verify.VerificationInfrastructureError, match="fingerprint mismatch"):
        coding_verify.verify(files)


@pytest.mark.parametrize("outcome,expected_exit", [("passed", 0), ("failed", 1), ("infrastructure", 2)])
def test_cli_emits_one_json_report_with_distinct_exit_codes(monkeypatch, fixture_data, outcome, expected_exit):
    files, _, observations = fixture_data
    if outcome == "failed":
        observations[0]["value"] = "wrong"
    if outcome == "infrastructure":
        observations.pop()
    monkeypatch.setattr(coding_verify, "_run_guest", lambda *args, **kwargs: {"observations": observations})
    monkeypatch.setattr(coding_verify.sys, "stdin", io.StringIO(json.dumps({"files": files})))
    output = io.StringIO()
    monkeypatch.setattr(coding_verify.sys, "stdout", output)
    assert coding_verify.main() == expected_exit
    result = json.loads(output.getvalue())
    assert result["suite_version"] == "date-parser-v1"
    assert result["completed"] is (outcome != "infrastructure")
