import json

import httpx
import pytest

from backend.engine import Engine
from backend.jsonutil import clone
from backend.models import price
from backend.scenarios import TARGET
from backend.store import Store


@pytest.fixture
def model_engine(tmp_path, monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-only-key")
    monkeypatch.setenv("META_MODEL", "test-only-model")
    monkeypatch.setenv("ATM_LIVE_MAX_CALLS", "3")
    monkeypatch.delenv("META_BASE_URL", raising=False)
    monkeypatch.delenv("META_INPUT_USD_PER_MILLION", raising=False)
    monkeypatch.delenv("META_OUTPUT_USD_PER_MILLION", raising=False)
    return Engine(Store(tmp_path / "models.sqlite3"))


def mock_meta(monkeypatch, handler):
    real_client = httpx.Client
    monkeypatch.setattr("backend.models.httpx.Client",
                        lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))


def completion(content, tokens=True, finish_reason="stop"):
    body = {"choices": [{"message": {"role": "assistant", "content": content},
                         "finish_reason": finish_reason}]}
    if tokens:
        body["usage"] = {"prompt_tokens": 100, "completion_tokens": 20, "total_tokens": 120}
    return httpx.Response(200, json=body)


def test_live_continuation_receives_changed_result_without_original_future(model_engine, monkeypatch):
    original = model_engine.create("cancel-order")
    cp = model_engine.checkpoint(original["checkpoints"][-1]["id"])
    old_reply = original["events"][-1]["content"]
    seen = []

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        assert old_reply not in json.dumps(body["messages"])
        last = json.loads(body["messages"][-1]["content"])
        assert last["value"]["order_id"] == TARGET
        assert last["value"]["status"] == "cancelled"
        assert "Expected one" not in json.dumps(body)
        assert "evaluator" not in json.dumps(body).lower()
        return completion("Order #W1048201 is cancelled. $129 will be refunded to your original Visa in 5-7 business days.")

    mock_meta(monkeypatch, handler)
    action = clone(cp["payload"]["pending_action"])
    action["arguments"]["order_id"] = TARGET
    branch = model_engine.branch(original["id"], cp["id"], action, continuation="live_meta")
    assert branch["execution"] == "completed"
    assert branch["outcome"]["status"] == "passed_checks"
    assert branch["usage"]["calls"] == 1
    assert branch["usage"]["total_tokens"] == 120
    assert branch["usage"]["cost_usd"] is None
    assert len(seen) == 1
    logged = model_engine.store.calls()[0]
    assert "test-only-key" not in json.dumps(logged)
    assert logged["response"]["content"].startswith("Order")
    assert logged["latency_ms"] >= 0


def test_timeout_is_persisted_as_failed_attempt_without_retry(model_engine, monkeypatch):
    calls = []

    def handler(request):
        calls.append(request)
        raise httpx.ReadTimeout("test timeout")

    mock_meta(monkeypatch, handler)
    run = model_engine.create("cancel-order", "live_meta")
    assert run["execution"] == "failed"
    assert run["outcome"]["status"] == "failed"
    assert run["usage"]["calls"] == 1 and run["usage"]["unknown_usage_calls"] == 1
    assert len(calls) == 1
    assert model_engine.store.calls()[0]["status"] == "failed"
    assert model_engine.store.calls()[0]["retries"] == 0


def test_proposal_is_reviewed_separately_and_included_in_branch_usage(model_engine, monkeypatch):
    original = model_engine.create("cancel-order")
    cp = model_engine.checkpoint(original["checkpoints"][-1]["id"])
    before_count = len(model_engine.store.list_runs())
    seen = []
    patch = {"tool": "cancel_pending_order", "arguments": {"order_id": TARGET, "reason": "no longer needed"},
             "explanation": "The customer confirmed #W1048201, while the pending call targets the gift."}

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        if body.get("response_format"):
            assert original["events"][-1]["content"] in body["messages"][1]["content"]
            return completion(json.dumps(patch))
        assert original["events"][-1]["content"] not in json.dumps(body["messages"])
        return completion("Order #W1048201 cancelled. $129 to your original Visa in 5-7 business days.")

    mock_meta(monkeypatch, handler)
    proposal = model_engine.propose(original["id"], cp["id"])
    assert proposal["status"] == "ready"
    assert proposal["failed_trace_access"]
    assert len(model_engine.store.list_runs()) == before_count  # No auto-execution.
    branch = model_engine.branch(original["id"], cp["id"], proposal["action"],
                                 continuation="live_meta", proposal_id=proposal["id"])
    assert branch["usage"]["calls"] == 2 and branch["usage"]["total_tokens"] == 240
    assert branch["patch"]["provenance"]["kind"] == "meta_proposal"
    assert len(seen) == 2
    assert model_engine.store.run(original["id"]) == original


def test_invalid_proposal_keeps_failed_call_in_ledger(model_engine, monkeypatch):
    original = model_engine.create("cancel-order")
    cp = model_engine.checkpoint(original["checkpoints"][-1]["id"])
    mock_meta(monkeypatch, lambda request: completion(json.dumps({
        "tool": "send_email", "arguments": {}, "explanation": "Unsupported action."})))
    proposal = model_engine.propose(original["id"], cp["id"])
    assert proposal["status"] == "failed" and proposal["error"]
    assert len(proposal["model_calls"]) == 1
    assert len(model_engine.store.calls()) == 1


def test_bounded_calls_stop_an_incomplete_live_agent(model_engine, monkeypatch):
    monkeypatch.setenv("ATM_LIVE_MAX_CALLS", "1")

    def handler(request):
        return httpx.Response(200, json={"choices": [{"finish_reason": "tool_calls", "message": {
            "role": "assistant", "content": None, "tool_calls": [{"id": "call_1", "type": "function",
            "function": {"name": "find_user_id_by_email", "arguments": '{"email":"maya.chen@example.com"}'}}]}}],
            "usage": {"prompt_tokens": 10, "completion_tokens": 5}})

    mock_meta(monkeypatch, handler)
    run = model_engine.create("cancel-order", "live_meta")
    assert "allowance exhausted" in run["error"]
    assert run["execution"] == "failed" and run["usage"]["calls"] == 1
    assert len(model_engine.store.calls()) == 1


@pytest.mark.parametrize("input_rate", ["nan", "inf", "-1", "not-a-price"])
def test_invalid_configured_prices_remain_unknown(monkeypatch, input_rate):
    monkeypatch.setenv("META_INPUT_USD_PER_MILLION", input_rate)
    monkeypatch.setenv("META_OUTPUT_USD_PER_MILLION", "1")
    assert price({"prompt_tokens": 100, "completion_tokens": 20}) is None

