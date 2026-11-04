import json

import httpx
import pytest

from backend.engine import Engine
from backend.store import Store


@pytest.mark.parametrize(("setting", "changed"), [
    ("ATM_LIVE_MAX_CALLS", "2"), ("META_REASONING_EFFORT", "high"),
])
def test_live_checkpoint_captures_request_bounds_and_rejects_silent_config_change(tmp_path, monkeypatch, setting, changed):
    monkeypatch.setenv("MODEL_API_KEY", "test-key")
    monkeypatch.setenv("META_MODEL", "test-model")
    monkeypatch.setenv("ATM_LIVE_MAX_CALLS", "1")
    monkeypatch.setenv("META_REASONING_EFFORT", "low")
    real_client = httpx.Client

    def handler(request):
        assert json.loads(request.content)["reasoning_effort"] == "low"
        return httpx.Response(200, json={"choices": [{"finish_reason": "tool_calls", "message": {
            "role": "assistant", "content": None, "tool_calls": [{
                "id": "t1", "type": "function", "function": {"name": "find_user_id_by_email",
                "arguments": json.dumps({"email": "maya.chen@example.com"})}}]}}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 8}})

    monkeypatch.setattr("backend.models.httpx.Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    engine = Engine(Store(tmp_path / "config.sqlite3"))
    original = engine.create("cancel-order", "live_meta")
    cp = engine.checkpoint(original["checkpoints"][0]["id"])
    config = cp["payload"]["agent_config"]
    assert config["max_calls"] == 1 and config["max_output_tokens"] <= 2048
    assert config["base_url"] == "https://api.meta.ai/v1"
    assert config["reasoning_effort"] == "low"
    assert "test-key" not in json.dumps(config)
    monkeypatch.setenv(setting, changed)
    with pytest.raises(ValueError, match="configuration changed"):
        engine.branch(original["id"], cp["id"], cp["payload"]["pending_action"])
    assert len(engine.store.calls()) == 1

