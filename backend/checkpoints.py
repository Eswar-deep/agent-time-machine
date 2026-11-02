from uuid import uuid4

from .environment import RetailEnvironment, compatibility
from .jsonutil import clone, digest

FORMAT_VERSION = 1
REQUIRED = {
    "format_version", "run_id", "parent_id", "scenario_id", "event_boundary",
    "environment", "conversation", "pending_action", "agent_state", "agent_config",
    "tools", "compatibility", "randomness",
}


class InvalidCheckpoint(ValueError):
    pass


def capture(run: dict, environment: RetailEnvironment, messages: list,
            pending: dict, agent_state: dict, agent_config: dict, event_boundary: int) -> dict:
    payload = {
        "format_version": FORMAT_VERSION, "run_id": run["id"], "parent_id": run["parent_id"],
        "scenario_id": run["scenario_id"], "event_boundary": event_boundary,
        "environment": environment.snapshot(), "conversation": clone(messages),
        "pending_action": clone(pending), "agent_state": clone(agent_state),
        "agent_config": clone(agent_config), "tools": environment.schemas(),
        "compatibility": compatibility(),
        "randomness": {"used": False, "description": "No local RNG; live provider sampling is not reproducible."},
    }
    return {"id": "cp_" + uuid4().hex, "run_id": run["id"], "payload": payload, "sha256": digest(payload)}


def restore(checkpoint: dict) -> tuple[RetailEnvironment, dict]:
    if not isinstance(checkpoint, dict) or not {"id", "run_id", "payload", "sha256"}.issubset(checkpoint):
        raise InvalidCheckpoint("Checkpoint envelope is incomplete. Import a checkpoint exported by this app.")
    payload = checkpoint["payload"]
    if not isinstance(payload, dict) or not REQUIRED.issubset(payload):
        raise InvalidCheckpoint("Checkpoint is incomplete. Record a new run with all supported agent state.")
    if digest(payload) != checkpoint["sha256"]:
        raise InvalidCheckpoint("Checkpoint checksum mismatch. Record a fresh run.")
    if payload["format_version"] != FORMAT_VERSION:
        raise InvalidCheckpoint("Unsupported checkpoint format. Record a new run in the current app version.")
    if payload["run_id"] != checkpoint["run_id"]:
        raise InvalidCheckpoint("Checkpoint ownership does not match its stored run.")
    if payload["compatibility"] != compatibility():
        raise InvalidCheckpoint("Incompatible checkpoint: simulator, application, policy, or Python version changed. Record a fresh run.")
    try:
        environment = RetailEnvironment(payload["environment"])
        if environment.schemas() != payload["tools"]:
            raise InvalidCheckpoint("Incompatible tool schemas. Record a fresh run.")
        environment.validate(payload["pending_action"])
        if not isinstance(payload["conversation"], list) or not payload["conversation"]:
            raise ValueError("Missing conversation.")
        agent = payload["agent_state"]
        if (not isinstance(agent, dict) or type(agent.get("cursor")) is not int
                or not 0 <= agent["cursor"] <= 12
                or type(agent.get("inject_failure")) is not bool
                or type(agent.get("injection_consumed")) is not bool):
            raise ValueError("Missing or invalid agent state.")
        config = payload["agent_config"]
        if not isinstance(config, dict) or config.get("kind") not in ("deterministic_demo", "live_meta"):
            raise ValueError("Unsupported agent configuration.")
        if config["kind"] == "live_meta" and not isinstance(config.get("model"), str):
            raise ValueError("Missing live model identity.")
        if config["kind"] == "live_meta" and not {"base_url", "max_calls", "max_output_tokens", "timeout_seconds"}.issubset(config):
            raise ValueError("Missing live request configuration.")
        if type(payload["event_boundary"]) is not int or payload["event_boundary"] < 0:
            raise ValueError("Invalid event boundary.")
        for message in payload["conversation"]:
            if not isinstance(message, dict) or message.get("role") not in ("developer", "user", "assistant", "tool"):
                raise ValueError("Invalid conversation message.")
        if payload["randomness"].get("used"):
            raise ValueError("This version cannot restore a stochastic local agent.")
    except InvalidCheckpoint:
        raise
    except Exception as error:
        raise InvalidCheckpoint("Checkpoint state cannot be restored. Record a fresh run: " + str(error)) from error
    return environment, clone(payload)

