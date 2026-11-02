import json
import sqlite3
from concurrent.futures import ThreadPoolExecutor

import pytest

from backend.checkpoints import InvalidCheckpoint, restore
from backend.engine import Engine
from backend.environment import InvalidAction, RetailEnvironment
from backend.jsonutil import canonical, clone, digest
from backend.models import ModelFailure, aggregate_usage, request_identity
from backend.scenarios import CARD, NEW_ADDRESS, TARGET, initial_state
from backend.store import NotFound, Store


@pytest.fixture
def engine(tmp_path):
    return Engine(Store(tmp_path / "runs.sqlite3"))


def corrected(scenario_id, action):
    action = clone(action)
    if scenario_id == "cancel-order":
        action["arguments"]["order_id"] = TARGET
    elif scenario_id == "shipping-address":
        action["arguments"].update(NEW_ADDRESS)
    else:
        action["arguments"]["payment_method_id"] = CARD
    return action


@pytest.mark.parametrize("scenario_id", ["cancel-order", "shipping-address", "return-refund"])
def test_real_tools_replay_intervention_and_persistence(engine, scenario_id):
    original = engine.create(scenario_id)
    assert original["injected_failure"]
    assert original["outcome"]["status"] == "failed"
    assert original["execution"] == "completed"
    before = canonical(original)
    for boundary in original["checkpoints"]:
        checkpoint = engine.checkpoint(boundary["id"])
        environment, payload = restore(checkpoint)
        # Replay every tool, including reads, from every pre-action boundary.
        for event in original["events"][payload["event_boundary"]:]:
            if event["kind"] == "tool":
                observed = environment.execute({"tool": event["tool"], "arguments": event["arguments"]})
                assert observed == event["observation"]
        assert environment.snapshot() == original["final_state"]
    assert engine.replay(original["id"])["replay"]["status"] == "matched"
    checkpoint = engine.checkpoint(original["checkpoints"][-1]["id"])
    branch = engine.branch(original["id"], checkpoint["id"], corrected(scenario_id, checkpoint["payload"]["pending_action"]))
    assert branch["outcome"]["status"] == "passed_checks"
    assert branch["mode"] == "deterministic_demo"
    assert canonical(engine.store.run(original["id"])) == before
    assert engine.compare(branch["id"])["state_diff"]
    # A new store/engine instance simulates process restart.
    reopened = Engine(Store(engine.store.path))
    assert reopened.store.run(branch["id"]) == branch
    assert reopened.checkpoint(checkpoint["id"]) == checkpoint
    assert branch["usage"]["calls"] == 0
    assert branch["usage"]["cost_usd"] is None


def test_siblings_are_independent_even_when_executed_concurrently(engine):
    original = engine.create("cancel-order")
    cp = engine.checkpoint(original["checkpoints"][-1]["id"])
    before = canonical(original)
    correct = corrected("cancel-order", cp["payload"]["pending_action"])
    wrong = cp["payload"]["pending_action"]
    with ThreadPoolExecutor(max_workers=2) as pool:
        futures = [pool.submit(engine.branch, original["id"], cp["id"], action) for action in [correct, wrong]]
        good, bad = [f.result() for f in futures]
    assert good["outcome"]["status"] == "passed_checks"
    assert bad["outcome"]["status"] == "failed"
    assert good["final_state"] != bad["final_state"]
    assert engine.store.run(good["id"]) == good
    assert canonical(engine.store.run(original["id"])) == before


def test_changed_context_does_not_copy_future_messages(engine):
    original = engine.create("cancel-order")
    cp = engine.checkpoint(original["checkpoints"][-1]["id"])
    original_final = original["events"][-1]["content"]
    assert "#W1048202" in original_final
    assert not any(original_final in str(message) for message in cp["payload"]["conversation"])
    branch = engine.branch(original["id"], cp["id"], corrected("cancel-order", cp["payload"]["pending_action"]))
    assert "#W1048201" in branch["events"][-1]["content"]
    assert original_final not in canonical(branch["conversation"])
    assert branch["events"][-1]["id"] != original["events"][-1]["id"]


def test_altered_read_output_is_detected_without_a_database_difference(engine):
    original = engine.create("cancel-order")
    forged = clone(original)
    forged["id"] = "run_altered_read"
    read = next(event for event in forged["events"] if event["kind"] == "tool")
    read["observation"]["value"] = "not_the_recorded_user"
    forged["checkpoints"] = []
    engine.store.save_run(forged, [])
    replay = engine.replay(forged["id"])
    assert replay["replay"]["state_match"]
    assert not replay["replay"]["observations_match"]
    assert replay["replay"]["status"] == "mismatch"
    assert replay["execution"] == "failed"


@pytest.mark.parametrize("field", ["format_version", "compatibility", "tools", "conversation", "agent_state"])
def test_incompatible_or_incomplete_state_rejected(engine, field):
    original = engine.create("cancel-order")
    checkpoint = engine.checkpoint(original["checkpoints"][-1]["id"])
    if field == "format_version":
        checkpoint["payload"][field] = 999
    elif field == "compatibility":
        checkpoint["payload"][field]["commit"] = "different-revision"
    elif field == "tools":
        checkpoint["payload"][field] = []
    else:
        del checkpoint["payload"][field]
    checkpoint["sha256"] = digest(checkpoint["payload"])
    with pytest.raises(InvalidCheckpoint):
        restore(checkpoint)


def test_missing_and_corrupt_checkpoints_are_actionable(engine):
    with pytest.raises(NotFound, match="Checkpoint not found"):
        engine.checkpoint("missing")
    original = engine.create("cancel-order")
    cp = engine.checkpoint(original["checkpoints"][-1]["id"])
    cp["payload"]["environment"]["orders"][TARGET]["status"] = "cancelled"
    with engine.store.connect() as connection:
        connection.execute("UPDATE checkpoints SET payload=? WHERE id=?", (canonical(cp["payload"]), cp["id"]))
    with pytest.raises(ValueError, match="checksum mismatch"):
        engine.checkpoint(cp["id"])


def test_cross_run_checkpoint_rejected(engine):
    one, two = engine.create("cancel-order"), engine.create("cancel-order")
    cp = engine.checkpoint(one["checkpoints"][-1]["id"])
    with pytest.raises(ValueError, match="another run"):
        engine.branch(two["id"], cp["id"], cp["payload"]["pending_action"])


def test_saved_runs_are_immutable(engine):
    run = engine.create("cancel-order")
    with pytest.raises(sqlite3.IntegrityError, match="immutable"):
        with engine.store.connect() as connection:
            connection.execute("UPDATE runs SET payload='{}' WHERE id=?", (run["id"],))


@pytest.mark.parametrize("action", [
    {"tool": "read_file", "arguments": {"path": "evaluator.py"}},
    {"tool": "cancel_pending_order", "arguments": {"order_id": 123, "reason": "no longer needed"}},
    {"tool": "cancel_pending_order", "arguments": {"order_id": TARGET, "reason": "no longer needed", "unexpected": True}},
])
def test_strict_tool_boundary(action):
    environment = RetailEnvironment(initial_state())
    with pytest.raises(InvalidAction):
        environment.validate(action)


def test_real_tool_error_is_saved_and_not_success(engine):
    original = engine.create("cancel-order")
    cp = engine.checkpoint(original["checkpoints"][-1]["id"])
    action = clone(cp["payload"]["pending_action"])
    action["arguments"]["order_id"] = "#DOES_NOT_EXIST"
    branch = engine.branch(original["id"], cp["id"], action)
    assert branch["execution"] == "failed"
    assert branch["outcome"]["status"] == "failed"
    assert branch["error"]
    assert branch["events"][-1]["kind"] == "execution_error"
    assert branch["final_state"] == cp["payload"]["environment"]
    replay = engine.replay(branch["id"])
    assert replay["replay"]["status"] == "matched"
    assert replay["replay"]["tool_errors"] == 1
    assert replay["outcome"]["status"] == "not_evaluated"
    assert replay["execution"] == "failed"


def test_state_equality_cannot_replace_communication_check(engine):
    from backend.evaluator import evaluate
    original = engine.create("cancel-order")
    cp = engine.checkpoint(original["checkpoints"][-1]["id"])
    branch = engine.branch(original["id"], cp["id"], corrected("cancel-order", cp["payload"]["pending_action"]))
    events_without_reply = [e for e in branch["events"] if e["kind"] != "agent_message"]
    result = evaluate(branch["scenario_id"], branch["initial_state"], branch["final_state"], events_without_reply, "completed")
    assert result["status"] == "failed"
    assert next(c for c in result["checks"] if c["id"] == "communication")["status"] == "failed"


def test_request_identity_includes_arguments_context_and_model():
    request = {"model": "test", "messages": [{"role": "user", "content": "before"}]}
    base = "https://api.meta.ai/v1"
    assert request_identity(base, request) == request_identity(base, clone(request))
    changed = clone(request)
    changed["messages"][0]["content"] = "after"
    assert request_identity(base, request) != request_identity(base, changed)
    changed = clone(request)
    changed["model"] = "different"
    assert request_identity(base, request) != request_identity(base, changed)


def test_no_credentials_or_allowance_blocks_live_without_network(engine, monkeypatch):
    for key in ["MODEL_API_KEY", "META_API_KEY", "META_MODEL", "ATM_LIVE_MAX_CALLS"]:
        monkeypatch.delenv(key, raising=False)
    with pytest.raises(ModelFailure, match="unavailable"):
        engine.create("cancel-order", "live_meta")
    assert engine.store.calls() == []


def test_unknown_usage_and_cost_are_not_reported_as_zero():
    usage = aggregate_usage([{"usage": None, "latency_ms": 12, "retries": 0, "cost_usd": None}])
    assert usage["cost_usd"] is None and usage["total_tokens"] is None
    assert usage["unknown_usage_calls"] == 1

