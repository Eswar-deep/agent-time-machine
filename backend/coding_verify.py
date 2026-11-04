"""Protected host-side verifier for the frozen coding fixture.

Candidate JavaScript runs only through coding_runtime's isolated QuickJS guest.
Expected values and the source-integrity decision never enter that guest.
Run this trusted coordinator with ``python -m backend.coding_verify``.
"""

from __future__ import annotations

from collections import Counter
import hashlib
import json
from pathlib import Path
import sys
from typing import Any


FIXTURE_ROOT = Path(__file__).resolve().parents[1] / "fixtures" / "date_parser"
SUITE_VERSION = "date-parser-v1"
MAX_REQUEST_CHARS = 2_000_000


class VerificationInfrastructureError(RuntimeError):
    """The trusted evaluation could not be completed or its fixture changed."""


def _source_hash(source: str) -> str:
    return hashlib.sha256(source.replace("\r\n", "\n").encode("utf-8")).hexdigest()


def _frozen_fixture() -> tuple[dict, dict, list[dict]]:
    manifest = json.loads((FIXTURE_ROOT / "manifest.json").read_text(encoding="utf-8"))
    if manifest.get("fixture_id") != SUITE_VERSION or manifest.get("hash_scheme") != "sha256_utf8_lf":
        raise VerificationInfrastructureError("Unsupported frozen fixture manifest")
    loaded = {}
    for name in ("requirements", "protected_evaluator"):
        entry = manifest[name]
        path = (FIXTURE_ROOT / entry["path"]).resolve()
        if not path.is_relative_to(FIXTURE_ROOT.resolve()):
            raise VerificationInfrastructureError("Frozen fixture path escapes its root")
        source = path.read_text(encoding="utf-8")
        if _source_hash(source) != entry["sha256"]:
            raise VerificationInfrastructureError(f"Frozen {name} fingerprint mismatch")
        loaded[name] = json.loads(source)
    requirements = loaded["requirements"]
    acceptance = loaded["protected_evaluator"]
    if requirements.get("fixture_id") != SUITE_VERSION or acceptance.get("fixture_id") != SUITE_VERSION:
        raise VerificationInfrastructureError("Frozen fixture version mismatch")
    cases = acceptance["cases"]
    ids = [case["id"] for case in cases]
    if len(set(ids)) != len(ids) or len(ids) != manifest["protected_evaluator"]["test_count"]:
        raise VerificationInfrastructureError("Frozen acceptance cases are inconsistent")
    if set(ids) != {check["id"] for check in requirements["acceptance_checks"]}:
        raise VerificationInfrastructureError("Frozen acceptance cases disagree with requirements")
    for case in cases:
        if case.get("group") not in ("reported_bug", "regression"):
            raise VerificationInfrastructureError("Unknown frozen acceptance group")
        if (case.get("throws") is True) == ("expected" in case):
            raise VerificationInfrastructureError("Acceptance case must specify a result or rejection")
        if "expected" in case and not isinstance(case["expected"], str):
            raise VerificationInfrastructureError("Frozen expected result must be a string")
    visible = manifest["visible_tests"]
    visible_path = (FIXTURE_ROOT / manifest["candidate_root"] / visible["path"]).resolve()
    if not visible_path.is_relative_to(FIXTURE_ROOT.resolve()):
        raise VerificationInfrastructureError("Frozen visible-test path escapes its root")
    if _source_hash(visible_path.read_text(encoding="utf-8")) != visible["sha256"]:
        raise VerificationInfrastructureError("Frozen visible-test fingerprint mismatch")
    return manifest, requirements, cases


def _run_guest(files: dict[str, str], *, cases: list[dict], execution_config: dict) -> dict:
    # The import is trusted project code. Neither candidate files nor expected
    # values are imported, evaluated, or provided as host Python/Node source.
    from .coding_runtime import run_guest

    return run_guest(files, operation="probe", cases=cases, execution_config=execution_config)


def _observation_detail(observation: dict) -> str:
    # Bound arbitrary candidate strings before including them in human-readable
    # output. The evaluator compares the full returned value before formatting.
    fields = {key: observation[key] for key in (
        "returned_type", "value", "threw", "error", "error_phase", "timed_out"
    ) if key in observation}
    rendered = json.dumps(fields, ensure_ascii=True, separators=(",", ":"), default=str)
    return rendered if len(rendered) <= 2000 else rendered[:2000] + "... [truncated]"


def _check_case(case: dict, observation: dict | None) -> tuple[bool, str]:
    if observation is None:
        return False, "No unique observation returned for this frozen case"
    actual = _observation_detail(observation)
    if observation.get("timed_out") is True:
        return False, "Guest timed out; a timeout is not a valid rejection. " + actual
    if case.get("throws") is True:
        passed = observation.get("threw") is True and observation.get("error_phase") == "invoke"
        return passed, ("Input rejected during invocation. " if passed else
                        "Expected an invocation error; load/result errors do not count. ") + actual
    passed = (
        observation.get("threw") is False
        and observation.get("error_phase") in (None, "")
        and not observation.get("error")
        and observation.get("returned_type") == "string"
        and isinstance(observation.get("value"), str)
        and observation["value"] == case["expected"]
    )
    return passed, ("Returned the required UTC instant. " if passed else
                    "Returned a different result or failed to return a string. ") + actual


def verify(files: dict[str, str], execution_config: dict | None = None) -> dict[str, Any]:
    """Compare untrusted guest observations with host-only frozen expectations."""
    if not isinstance(files, dict) or any(not isinstance(path, str) or not isinstance(source, str)
                                          for path, source in files.items()):
        raise VerificationInfrastructureError("files must map relative paths to source strings")
    if execution_config is None:
        execution_config = {}
    if not isinstance(execution_config, dict):
        raise VerificationInfrastructureError("execution_config must be an object")
    manifest, _, cases = _frozen_fixture()
    visible = manifest["visible_tests"]
    candidate_tests = files.get(visible["path"])
    tampered = candidate_tests is None or _source_hash(candidate_tests) != visible["sha256"]
    integrity_detail = ("Candidate visible tests match the frozen source fingerprint" if not tampered else
                        "Candidate visible tests are missing or differ from the frozen source fingerprint")
    checks = [{"id": "visible_tests_unchanged", "label": "Visible tests remain unchanged",
               "status": "failed" if tampered else "passed", "detail": integrity_detail, "group": "integrity"}]

    # Never include expected values, protected cases, or evaluator source in the
    # guest. Each probe receives only its public-style input and an opaque id.
    envelope = _run_guest(files, cases=[{"id": case["id"], "input": case["input"]} for case in cases],
                          execution_config=execution_config)
    if not isinstance(envelope, dict):
        raise VerificationInfrastructureError("Guest runner returned a malformed envelope")
    raw_observations = envelope.get("observations", [])
    if not isinstance(raw_observations, list):
        raise VerificationInfrastructureError("Guest observations must be a list")
    observations = [item for item in raw_observations if isinstance(item, dict) and isinstance(item.get("id"), str)]
    counts = Counter(item["id"] for item in observations)
    unique = {item["id"]: item for item in observations if counts[item["id"]] == 1}
    expected_ids = {case["id"] for case in cases}
    complete_observations = (len(observations) == len(raw_observations) == len(cases)
                             and set(counts) == expected_ids and all(count == 1 for count in counts.values()))
    completed = complete_observations and envelope.get("completed", True) is not False and not envelope.get("error")
    for case in cases:
        passed, detail = _check_case(case, unique.get(case["id"]))
        checks.append({"id": case["id"], "label": case["label"],
                       "status": "passed" if passed else "failed", "detail": detail, "group": case["group"]})
    if not completed:
        checks.append({"id": "evaluation_completed", "label": "Protected evaluation completed",
                       "status": "failed", "group": "infrastructure",
                       "detail": "Runner did not return every frozen case exactly once without infrastructure errors. "
                                 + str(envelope.get("error") or "Incomplete or inconsistent observations")[:2000]})
    lines = [f"Protected suite: {SUITE_VERSION}",
             f"Frozen requirements SHA-256: {manifest['requirements']['sha256']}",
             f"Protected evaluator SHA-256: {manifest['protected_evaluator']['sha256']}"]
    lines.extend(f"{check['status'].upper()}: {check['id']} | {check['label']} | {check['detail']}" for check in checks)
    passed_count = sum(check["status"] == "passed" for check in checks)
    lines.append(f"Result: {passed_count}/{len(checks)} checks passed; "
                 f"tamper_detected={str(tampered).lower()}; completed={str(completed).lower()}")
    return {"requirements_hash": manifest["requirements"]["sha256"],
            "protected_evaluator_hash": manifest["protected_evaluator"]["sha256"],
            "suite_version": SUITE_VERSION, "checks": checks, "tamper_detected": tampered,
            "report": "\n".join(lines) + "\n", "completed": completed}


def main() -> int:
    """Emit exactly one JSON report; exit 0/pass, 1/candidate failure, 2/infra."""
    try:
        raw = sys.stdin.read(MAX_REQUEST_CHARS + 1)
        if len(raw) > MAX_REQUEST_CHARS:
            raise VerificationInfrastructureError("Verification request exceeds the input limit")
        payload = json.loads(raw)
        if not isinstance(payload, dict):
            raise VerificationInfrastructureError("Verification request must be an object")
        result = verify(payload["files"], payload.get("execution_config", {}))
        status = 2 if not result["completed"] else (0 if all(check["status"] == "passed" for check in result["checks"]) else 1)
    except Exception as error:
        # Report infrastructure failures as data without dumping source files,
        # credentials, local environment variables, or stack frames to stdout.
        detail = f"{type(error).__name__}: {str(error)[:2000]}"
        result = {"requirements_hash": None, "protected_evaluator_hash": None,
                  "suite_version": SUITE_VERSION,
                  "checks": [{"id": "evaluation_completed", "label": "Protected evaluation completed",
                              "status": "failed", "detail": detail, "group": "infrastructure"}],
                  "tamper_detected": False, "report": "INFRASTRUCTURE ERROR: " + detail + "\n", "completed": False}
        status = 2
    sys.stdout.write(json.dumps(result, ensure_ascii=True, allow_nan=False) + "\n")
    return status


if __name__ == "__main__":
    raise SystemExit(main())
