"""Repair contracts use mocked HTTP inference and actual isolated fixture execution.

These tests verify integration mechanics, never live model quality or recovery gains.
"""

import json

import httpx
import pytest
from fastapi.testclient import TestClient

from backend.api import create_app
from backend.coding import FIXTURE
from backend.engine import Engine
from backend.jsonutil import canonical, clone
from backend.store import Store


@pytest.fixture(scope="module")
def recorded_coding_runs(tmp_path_factory):
    engine = Engine(Store(tmp_path_factory.mktemp("repair-recordings") / "records.sqlite3"))
    records = []
    for scenario in ("coding-date-parser", "coding-test-tamper"):
        run = engine.create(scenario)
        checkpoints = [engine.checkpoint(item["id"]) for item in run["checkpoints"]]
        records.append((run, checkpoints))
    return records


@pytest.fixture
def repair_engine(tmp_path, monkeypatch, recorded_coding_runs):
    monkeypatch.setenv("MODEL_API_KEY", "repair-tests-only-key")
    monkeypatch.setenv("META_MODEL", "repair-tests-only-model")
    monkeypatch.setenv("ATM_LIVE_MAX_CALLS", "3")
    monkeypatch.setenv("META_REASONING_EFFORT", "low")
    monkeypatch.delenv("META_BASE_URL", raising=False)
    monkeypatch.delenv("META_INPUT_USD_PER_MILLION", raising=False)
    monkeypatch.delenv("META_OUTPUT_USD_PER_MILLION", raising=False)
    engine = Engine(Store(tmp_path / "repairs.sqlite3"))
    for run, checkpoints in recorded_coding_runs:
        engine.store.save_run(clone(run), clone(checkpoints))
    return engine


def recording(engine, scenario="coding-date-parser"):
    return next(run for run in engine.store.list_runs() if run["scenario_id"] == scenario)


def edit_boundary(engine, run):
    return engine.checkpoint(next(item["id"] for item in run["checkpoints"] if item["tool"] == "write_file"))


def correct_action():
    patch = json.loads((FIXTURE / "patches" / "correct.json").read_text(encoding="utf-8"))
    path, content = next(iter(patch["files"].items()))
    return {"tool": "write_file", "arguments": {"path": path, "content": content}}


def ready_response(engine, run):
    checkpoint = edit_boundary(engine, run)
    evidence = next(event["id"] for event in run["events"]
                    if event["kind"] == "tool" and event["tool"] == "write_file")
    return {"status": "ready", "checkpoint_id": checkpoint["id"], "evidence_refs": [evidence],
            "explanation": "REPAIR_ADVICE_SENTINEL: the edit removed the timezone-offset adjustment.",
            "expected_improvement": "Keep Z support while preserving the UTC instant for signed offsets.",
            "action": correct_action()}


def completion(content, tool=None):
    message = {"role": "assistant", "content": content}
    if tool:
        message["tool_calls"] = [{"id": "fresh-decision", "type": "function", "function": {
            "name": tool["tool"], "arguments": canonical(tool["arguments"])}}]
    return httpx.Response(200, json={
        "choices": [{"finish_reason": "tool_calls" if tool else "stop", "message": message}],
        "usage": {"prompt_tokens": 100, "completion_tokens": 20},
    })


def mock_meta(monkeypatch, handler):
    real_client = httpx.Client
    monkeypatch.setattr("backend.models.httpx.Client",
                        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))


def test_model_selects_supported_checkpoint_and_cites_visible_evidence(repair_engine, monkeypatch):
    engine = repair_engine
    original = recording(engine)
    proposed = ready_response(engine, original)
    selected_hint = original["checkpoints"][0]["id"]
    assert proposed["checkpoint_id"] != selected_hint
    original_saved = canonical(original)
    seen = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        serialized = canonical(body)
        assert body["response_format"] == {"type": "json_object"}
        assert all(item["id"] in serialized for item in original["checkpoints"])
        assert all(event["id"] in serialized for event in original["events"])
        assert "Fix timestamp_parser.js" in serialized
        assert "FAIL reported_z_format" in serialized
        assert "offsetMinutes" in serialized and "unified_diff" in serialized
        assert "protected/acceptance.json" not in serialized
        assert "patches/correct.json" not in serialized
        assert "2026-11-04T23:45:00-05:30" not in serialized
        assert "2026-11-05T05:15:00.000Z" not in serialized
        assert original["events"][-1]["content"] in serialized
        return completion(json.dumps(proposed))

    mock_meta(monkeypatch, handler)
    proposal = engine.propose(original["id"], selected_hint)
    assert proposal["status"] == "ready" and proposal["checkpoint_id"] == proposed["checkpoint_id"]
    for field in ("evidence_refs", "explanation", "expected_improvement", "action"):
        assert proposal[field] == proposed[field]
    assert proposal["failed_trace_access"] is True
    assert len(seen) == len(proposal["model_calls"]) == 1
    call = proposal["model_calls"][0]
    assert call["purpose"] == "proposal" and call["model"] == "repair-tests-only-model"
    assert call["provider"] == "Meta" and call["api_surface"] == "Chat Completions"
    assert call["endpoint"] == "https://api.meta.ai/v1/chat/completions"
    assert call["role"] == "repair_proposer"
    assert call["generation_config"]["reasoning_effort"] == "low"
    assert call["usage"]["total_tokens"] == 120 and call["cost_usd"] is None
    assert "repair-tests-only-key" not in canonical(proposal)
    assert canonical(engine.store.run(original["id"])) == original_saved
    assert len(engine.store.list_runs()) == 2  # Proposing never auto-executes a branch.


def test_insufficient_evidence_is_retained_without_a_repair_or_branch(repair_engine, monkeypatch):
    original = recording(repair_engine)
    answer = {"status": "insufficient_evidence", "checkpoint_id": None, "evidence_refs": [],
              "explanation": "The trace does not establish a bounded correction.",
              "expected_improvement": None, "action": None}
    mock_meta(monkeypatch, lambda request: completion(json.dumps(answer)))
    proposal = repair_engine.propose(original["id"])
    assert proposal["status"] == "insufficient_evidence"
    assert proposal["action"] is None and proposal["checkpoint_id"] is None
    assert proposal["explanation"] == answer["explanation"]
    assert len(proposal["model_calls"]) == 1
    assert repair_engine.store.proposal(proposal["id"]) == proposal
    assert len(repair_engine.store.list_runs()) == 2


def test_api_requests_checkpoint_selection_without_a_manual_boundary(repair_engine, monkeypatch):
    original = recording(repair_engine)
    answer = ready_response(repair_engine, original)
    mock_meta(monkeypatch, lambda request: completion(json.dumps(answer)))
    with TestClient(create_app(repair_engine.store.path, seed=False)) as client:
        response = client.post(f"/api/runs/{original['id']}/proposals", json={})
        assert response.status_code == 201
        proposal = response.json()
        assert proposal["status"] == "ready" and proposal["checkpoint_id"] == answer["checkpoint_id"]
        assert client.get("/api/proposals/" + proposal["id"]).json() == proposal


def test_response_echoed_credentials_are_redacted_from_proposal_ledger_and_export(repair_engine, monkeypatch):
    engine = repair_engine
    original = recording(engine)
    answer = ready_response(engine, original)
    secret = "repair-tests-only-key"
    answer["explanation"] += " Provider output echoed " + secret
    answer["action"]["arguments"]["content"] += "\n// Echoed credential: " + secret + "\n"
    mock_meta(monkeypatch, lambda request: completion(json.dumps(answer)))
    proposal = engine.propose(original["id"])
    assert proposal["status"] == "ready"
    assert secret not in canonical(proposal) and "[REDACTED]" in proposal["explanation"]
    assert "[REDACTED]" in proposal["action"]["arguments"]["content"]
    assert secret not in canonical(engine.store.calls())
    assert secret not in canonical(Store(engine.store.path).proposal(proposal["id"]))
    with TestClient(create_app(engine.store.path, seed=False)) as client:
        exported = client.get(f"/api/runs/{original['id']}/export").json()
        ledger = client.get("/api/model-calls").json()
        assert proposal["id"] in canonical(exported)
        assert secret not in canonical(exported) and secret not in canonical(ledger)
        assert "[REDACTED]" in canonical(exported) and "[REDACTED]" in canonical(ledger)


@pytest.mark.parametrize("invalid", [
    "unknown_field", "status", "explanation_type", "missing_evidence", "unknown_evidence",
    "null_checkpoint", "foreign_checkpoint", "path_escape", "unsupported_tool", "content_type",
    "required_file_deletion", "insufficient_with_action", "not_json", "non_object",
])
def test_invalid_model_proposals_fail_closed_and_remain_inspectable(repair_engine, monkeypatch, invalid):
    engine = repair_engine
    original = recording(engine)
    answer = ready_response(engine, original)
    if invalid == "unknown_field":
        answer["extra"] = "not allowed"
    elif invalid == "status":
        answer["status"] = "successful"
    elif invalid == "explanation_type":
        answer["explanation"] = 42
    elif invalid == "missing_evidence":
        answer["evidence_refs"] = []
    elif invalid == "unknown_evidence":
        answer["evidence_refs"] = ["evt_not_in_this_execution"]
    elif invalid == "null_checkpoint":
        answer["checkpoint_id"] = None
    elif invalid == "foreign_checkpoint":
        answer["checkpoint_id"] = edit_boundary(engine, recording(engine, "coding-test-tamper"))["id"]
    elif invalid == "path_escape":
        answer["action"]["arguments"]["path"] = "../protected/acceptance.json"
    elif invalid == "unsupported_tool":
        answer["action"] = {"tool": "run_shell", "arguments": {"command": "echo success"}}
    elif invalid == "content_type":
        answer["action"]["arguments"]["content"] = ["not source text"]
    elif invalid == "required_file_deletion":
        answer["action"] = {"tool": "delete_file", "arguments": {"path": "test_timestamp_parser.js"}}
    elif invalid == "insufficient_with_action":
        answer["status"] = "insufficient_evidence"
        answer["checkpoint_id"] = None
    raw_reply = "This is not a JSON proposal." if invalid == "not_json" else json.dumps(
        [] if invalid == "non_object" else answer)
    mock_meta(monkeypatch, lambda request: completion(raw_reply))
    before = canonical(engine.store.run(original["id"]))
    proposal = engine.propose(original["id"])
    assert proposal["status"] == "failed" and proposal["error"]
    assert proposal.get("raw_response") is not None
    assert len(proposal["model_calls"]) == 1
    assert proposal["model_calls"][0]["status"] == "completed"  # HTTP completed; validation failed.
    assert engine.store.proposal(proposal["id"]) == proposal
    assert proposal in engine.store.proposals(original["id"])
    assert canonical(engine.store.run(original["id"])) == before
    assert len(engine.store.list_runs()) == 2


def test_failed_provider_proposal_is_persisted_without_retry_or_fallback(repair_engine, monkeypatch):
    original = recording(repair_engine)
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(503, json={"error": {"code": "unavailable", "message": "Temporary provider failure."}})

    mock_meta(monkeypatch, handler)
    proposal = repair_engine.propose(original["id"])
    assert proposal["status"] == "failed" and "503" in proposal["error"]
    assert proposal["action"] is None
    assert len(seen) == len(proposal["model_calls"]) == 1
    call = proposal["model_calls"][0]
    assert call["status"] == "failed" and call["retries"] == 0
    assert call["usage"] is None and call["cost_usd"] is None
    assert len(repair_engine.store.list_runs()) == 2


def test_all_proposal_attempts_remain_available_newest_first_after_reload(repair_engine, monkeypatch):
    engine = repair_engine
    original = recording(engine)
    invalid = {**ready_response(engine, original), "evidence_refs": ["evt_unknown"]}
    insufficient = {"status": "insufficient_evidence", "checkpoint_id": None, "evidence_refs": [],
                    "explanation": "More development evidence is needed.", "expected_improvement": None, "action": None}
    answers = iter((invalid, insufficient, ready_response(engine, original)))
    mock_meta(monkeypatch, lambda request: completion(json.dumps(next(answers))))
    attempts = [engine.propose(original["id"]) for _ in range(3)]
    assert [proposal["status"] for proposal in attempts] == ["failed", "insufficient_evidence", "ready"]
    reopened = Store(engine.store.path)
    assert [proposal["id"] for proposal in reopened.proposals(original["id"])] == [
        proposal["id"] for proposal in reversed(attempts)]
    with TestClient(create_app(engine.store.path, seed=False)) as client:
        listed = client.get(f"/api/runs/{original['id']}/proposals")
        assert listed.status_code == 200 and listed.json() == list(reversed(attempts))
        for attempt in attempts:
            assert client.get("/api/proposals/" + attempt["id"]).json() == attempt
    assert len(engine.store.calls()) == 3 and len(engine.store.list_runs()) == 2


def test_reviewed_proposal_branch_uses_fresh_context_and_counts_repair_overhead(repair_engine, monkeypatch):
    engine = repair_engine
    original = recording(engine)
    answer = ready_response(engine, original)
    future = original["events"][-1]["content"]
    parent_saved = canonical(original)
    seen = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        if body.get("response_format"):
            return completion(json.dumps(answer))
        context = canonical(body["messages"])
        assert future not in context
        assert "REPAIR_ADVICE_SENTINEL" not in context
        assert "execution_events" not in context
        assert "2026-11-04T23:45:00-05:30" not in context
        last = json.loads(body["messages"][-1]["content"])["value"]
        if len(seen) == 2:
            assert last["path"] == "timestamp_parser.js"
            assert last["file_diffs"][0]["after"] == answer["action"]["arguments"]["content"]
            return completion(None, {"tool": "run_tests", "arguments": {"suite": "visible"}})
        assert last["exit_code"] == 0
        return completion("Fresh continuation verified the visible command; protected checks run independently.")

    mock_meta(monkeypatch, handler)
    proposal = engine.propose(original["id"])
    edited = clone(proposal["action"])
    edited["arguments"]["content"] += "\n// An unreviewed change.\n"
    with pytest.raises(ValueError, match="[Pp]roposal"):
        engine.branch(original["id"], proposal["checkpoint_id"], edited,
                      continuation="live_meta", proposal_id=proposal["id"])
    assert len(seen) == 1  # Matching is checked before another provider request.
    branch = engine.branch(original["id"], proposal["checkpoint_id"], proposal["action"],
                           continuation="live_meta", proposal_id=proposal["id"])
    assert branch["execution"] == "completed" and branch["outcome"]["passed"] == branch["outcome"]["total"] == 28
    assert branch["verification"]["command"]["exit_code"] == 0
    assert branch["patch"]["provenance"]["kind"] == "meta_proposal"
    assert branch["patch"]["provenance"]["proposal_id"] == proposal["id"]
    assert branch["patch"]["provenance"]["failed_trace_access"] is True
    assert branch["fork_checkpoint_id"] == proposal["checkpoint_id"]
    assert branch["usage"]["calls"] == len(seen) == 3
    assert branch["usage"]["total_tokens"] == 360
    assert branch["usage"]["cost_usd"] is None and branch["usage"]["cost_status"] == "unknown"
    assert [call["purpose"] for call in branch["model_calls"]] == ["proposal", "continuation", "continuation"]
    assert canonical(engine.store.run(original["id"])) == parent_saved
    assert engine.compare(branch["id"])["original_unchanged"]

    # Reloading and exporting retain the proposal, original execution evidence,
    # selected boundary, and measured calls rather than only transient UI state.
    with TestClient(create_app(engine.store.path, seed=False)) as client:
        assert client.get("/api/proposals/" + proposal["id"]).json() == proposal
        listed = client.get(f"/api/runs/{original['id']}/proposals").json()
        assert proposal in listed
        exported = client.get(f"/api/runs/{branch['id']}/export").json()
        exported_text = canonical(exported)
        assert proposal["id"] in exported_text and answer["explanation"] in exported_text
        assert original["events"][-1]["id"] in exported_text
        assert proposal["checkpoint_id"] in exported_text
        assert all(call["id"] in exported_text for call in branch["model_calls"])
        assert "repair-tests-only-key" not in exported_text


def test_checkpoint_restart_uses_only_fresh_decisions_without_repair_advice(repair_engine, monkeypatch):
    engine = repair_engine
    original = recording(engine)
    answer = ready_response(engine, original)
    future = original["events"][-1]["content"]
    seen = []
    restart_requests = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        if body.get("response_format"):
            return completion(json.dumps(answer))
        restart_requests.append(body)
        context = canonical(body["messages"])
        assert future not in context and "REPAIR_ADVICE_SENTINEL" not in context
        assert "execution_events" not in context
        if len(restart_requests) == 1:
            last = json.loads(body["messages"][-1]["content"])["value"]
            assert last["exit_code"] == 1  # Ordinary context ends at the original pre-edit test.
            assert "return new Date(local.getTime()).toISOString();" not in context
            return completion(None, correct_action())
        if len(restart_requests) == 2:
            return completion(None, {"tool": "run_tests", "arguments": {"suite": "visible"}})
        return completion("A fresh checkpoint restart completed its own edit and test decisions.")

    mock_meta(monkeypatch, handler)
    proposal = engine.propose(original["id"])
    restarted = engine.restart(original["id"], answer["checkpoint_id"])
    assert restarted["execution"] == "completed" and restarted["outcome"]["passed"] == 28
    assert restarted["fork_checkpoint_id"] == answer["checkpoint_id"]
    assert restarted["patch"] is None
    assert restarted["restart"] == {"kind": "checkpoint_restart_without_advice",
                                    "checkpoint_id": answer["checkpoint_id"],
                                    "failed_trace_access": False, "pending_action_discarded": True}
    assert "repair_proposer" not in restarted["model_roles"]
    assert restarted["model_roles"]["continuing_agent"]
    assert restarted["usage"]["calls"] == len(restart_requests) == 3
    assert restarted["usage"]["total_tokens"] == 360
    assert all(call["purpose"] == "continuation" for call in restarted["model_calls"])
    assert proposal["model_calls"][0]["id"] not in {call["id"] for call in restarted["model_calls"]}
    assert len(engine.store.calls()) == 4  # Proposal overhead remains globally visible.
    assert "REPAIR_ADVICE_SENTINEL" not in canonical(restarted["conversation"])
    assert engine.compare(restarted["id"])["original_unchanged"]
