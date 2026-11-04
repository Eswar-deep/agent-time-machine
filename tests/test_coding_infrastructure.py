from backend.coding import CodingEnvironment
from backend.engine import Engine
from backend.store import Store


def test_incomplete_protected_evaluation_marks_saved_run_failed(tmp_path, monkeypatch):
    monkeypatch.setattr(CodingEnvironment, "verify", lambda self: {
        "completed": False, "checks": [], "tamper_detected": False,
        "requirements_hash": "", "protected_evaluator_hash": "", "suite_version": "date-parser-v1",
        "error": "Protected verifier timed out.",
        "command": {"command": ["python", "-m", "backend.coding_verify"], "exit_code": None,
                    "stdout": "", "stderr": "Timed out", "timed_out": True},
    })
    engine = Engine(Store(tmp_path / "incomplete.sqlite3"))
    run = engine.create("coding-date-parser")
    assert run["execution"] == "failed"
    assert run["outcome"]["status"] == "failed"
    assert run["events"][-1]["kind"] == "execution_error"
    assert run["events"][-1]["source"] == "protected_evaluator"
    assert engine.store.run(run["id"])["error"] == "Protected verifier timed out."
