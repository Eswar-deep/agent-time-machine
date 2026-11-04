import json
import time
from uuid import uuid4

from . import domains
from .checkpoints import capture, restore
from .jsonutil import canonical, clone, digest, now, state_diff
from .models import MetaClient, ModelFailure, aggregate_usage, bounded_integer, meta_status
from .playground import POLICY as PLAYGROUND_POLICY, Supervisor, hard_block
from .redaction import redact_credentials
from .store import Store


class Engine:
    def __init__(self, store: Store):
        self.store = store

    def _agent_config(self, kind, playground=False):
        config = {"kind": kind, "model": None}
        if kind == "live_meta":
            status = meta_status()
            config.update({"model": status["model"], "base_url": status["base_url"],
                           "max_calls": status["max_calls"], "max_output_tokens": status["max_output_tokens"],
                           "reasoning_effort": status["reasoning_effort"],
                           "timeout_seconds": bounded_integer("ATM_LIVE_TIMEOUT_SECONDS", 60, 1, 60)})
        if playground:
            config["playground"] = True
        return config

    def _model_role(self, kind, role="continuing_agent"):
        status = meta_status()
        return {"role": role, "provider": "Meta" if kind == "live_meta" else "scripted_demo",
                "product": "Meta Model API" if kind == "live_meta" else None,
                "api_surface": "Chat Completions" if kind == "live_meta" else None,
                "model": status["model"] if kind == "live_meta" else None,
                "endpoint": status["base_url"].rstrip("/") + "/chat/completions" if kind == "live_meta" else None}

    def _new_run(self, scenario_id, mode, parent_id=None):
        task = domains.scenario(scenario_id)
        return {"id": "run_" + uuid4().hex, "parent_id": parent_id, "fork_checkpoint_id": None,
                "created_at": now(), "scenario_id": scenario_id, "domain": task["domain"], "title": task["title"], "mode": mode,
                "injected_failure": False, "execution": "running", "error": None, "patch": None,
                "events": [], "checkpoints": [], "model_calls": [], "replay": None,
                "model_roles": {"continuing_agent": self._model_role(mode)},
                "compatibility": domains.compatibility(task["domain"]), "elapsed_ms": 0}

    def _event(self, run, kind, **data):
        event = {"id": "evt_" + uuid4().hex, "seq": len(run["events"]), "kind": kind,
                 "timestamp": now(), "inherited": False, **clone(data)}
        run["events"].append(event)
        return event

    def create(self, scenario_id: str, mode: str = "deterministic_demo", experiment=None) -> dict:
        if mode not in ("deterministic_demo", "live_meta"):
            raise ValueError("Choose deterministic_demo or live_meta.")
        if mode == "live_meta" and not meta_status()["available"]:
            raise ModelFailure("Live Meta is unavailable. " + " ".join(meta_status()["blockers"]))
        run = self._new_run(scenario_id, mode)
        environment = domains.fresh_environment(scenario_id)
        run["initial_state"] = environment.snapshot()
        run["injected_failure"] = mode == "deterministic_demo"
        task = domains.scenario(scenario_id)
        messages = [{"role": "developer", "content": domains.policy(run["domain"])}, {"role": "user", "content": task["request"]}]
        if experiment is not None:
            run["experiment"] = clone(experiment)
            messages[0]["content"] += "\n" + PLAYGROUND_POLICY
            if experiment["instruction"]:
                messages.append({"role": "user", "content": experiment["instruction"]})
        self._event(run, "user_message", content=task["request"], source="scenario")
        if experiment and experiment["instruction"]:
            self._event(run, "user_message", content=experiment["instruction"], source="experiment")
        agent_state = {"cursor": 0, "inject_failure": mode == "deterministic_demo", "injection_consumed": False}
        config = self._agent_config(mode, playground=experiment is not None)
        return self._drive(run, environment, messages, agent_state, config)

    def experiment(self, scenario_id, variant_instruction):
        if domains.scenario(scenario_id)["domain"] != "coding":
            raise ValueError("The playground currently supports coding scenarios.")
        if not variant_instruction.strip():
            raise ValueError("Enter an instruction to test in the variant.")
        status = meta_status()
        if not status["available"] or status["max_calls"] < 2:
            raise ModelFailure("The playground needs live Meta and at least two allowed calls per run. "
                               + " ".join(status["blockers"]))
        variant_instruction = redact_credentials(variant_instruction.strip())
        experiment_id = "exp_" + uuid4().hex
        baseline = self.create(scenario_id, "live_meta",
                               {"id": experiment_id, "arm": "baseline", "instruction": ""})
        variant = self.create(scenario_id, "live_meta",
                              {"id": experiment_id, "arm": "variant", "instruction": variant_instruction})
        return {"id": experiment_id, "baseline": baseline, "variant": variant}

    def checkpoint(self, checkpoint_id: str) -> dict:
        checkpoint = self.store.checkpoint(checkpoint_id)
        restore(checkpoint)
        return checkpoint

    def _tool(self, run, environment, messages, state, config, pending, checkpoints,
              decision_source=None, supervisor=None):
        if supervisor and state["cursor"] >= 12:
            raise RuntimeError("Step allowance exhausted. Run is incomplete.")
        pending = environment.validate(pending)
        checkpoint = capture(run, environment, messages, pending, state, config, len(run["events"]))
        checkpoints.append(checkpoint)
        run["checkpoints"].append({"id": checkpoint["id"], "sha256": checkpoint["sha256"],
                                   "event_boundary": len(run["events"]), "tool": pending["tool"],
                                   "step": state["cursor"] + 1})
        if supervisor:
            reason = hard_block(pending)
            source = "runtime_policy"
            if reason is None and pending["tool"] == "write_file":
                source = "meta_supervisor"
                try:
                    review = supervisor.review(domains.scenario(run["scenario_id"])["request"], pending)
                except Exception as error:
                    reason = "Supervisor review unavailable: " + type(error).__name__
                else:
                    reason = review.reason if review.decision == "block" else None
                    if reason is None:
                        self._event(run, "policy_review", source=source, decision="allow",
                                    content=review.reason, tool=pending["tool"], checkpoint_id=checkpoint["id"])
            if reason is not None:
                self._event(run, "policy_review", source=source, decision="block",
                            content=reason, tool=pending["tool"], checkpoint_id=checkpoint["id"])
                raise RuntimeError(reason)
        call_id = "tool_" + uuid4().hex
        assistant = {"role": "assistant", "content": None, "tool_calls": [{
            "id": call_id, "type": "function", "function": {
                "name": pending["tool"], "arguments": canonical(pending["arguments"])}}]}
        messages.append(assistant)
        started = time.perf_counter()
        observation = environment.execute(pending)
        self._event(run, "tool", **pending, observation=observation, checkpoint_id=checkpoint["id"],
                    source=config["kind"], decision_source=decision_source or config["kind"],
                    latency_ms=round((time.perf_counter() - started) * 1000, 2))
        messages.append({"role": "tool", "tool_call_id": call_id, "content": canonical(observation)})
        state["cursor"] += 1
        if not observation["ok"]:
            raise RuntimeError(observation["error"]["message"])

    def _drive(self, run, environment, messages, state, config, first_action=None, proposal_calls=None):
        checkpoints = []
        started = time.perf_counter()
        own_calls = list(proposal_calls or [])
        supervisor = Supervisor(self.store, run["id"], config["max_calls"], own_calls) if config.get("playground") else None
        if supervisor:
            run["model_roles"]["supervisor"] = self._model_role("live_meta", "supervisor")
        try:
            if first_action is not None:
                self._tool(run, environment, messages, state, config, first_action, checkpoints,
                           decision_source=run["patch"]["provenance"]["kind"], supervisor=supervisor)
            for _ in range(12):
                if config["kind"] == "deterministic_demo":
                    action = domains.next_action(run.get("domain", "retail"), run["scenario_id"], state, messages)
                    if action is None:
                        final = domains.final_message(run.get("domain", "retail"), messages)
                        messages.append({"role": "assistant", "content": final})
                        self._event(run, "agent_message", content=final, source="deterministic_demo")
                        run["execution"] = "completed"
                        break
                else:
                    if supervisor:
                        supervisor.require_execution_budget()
                    message, call = MetaClient(self.store).complete(
                        messages, environment.schemas(), run["id"], "continuation", len(own_calls))
                    own_calls.append(call)
                    self._event(run, "model_call", model=call["model"], request_hash=call["request_hash"],
                                usage=call["usage"], latency_ms=call["latency_ms"], source="live_meta")
                    tool_calls = message.get("tool_calls", [])
                    if not tool_calls:
                        if not message.get("content"):
                            raise ModelFailure("Meta returned neither a tool action nor a final message.")
                        messages.append(message)
                        self._event(run, "agent_message", content=message["content"], source="live_meta")
                        run["execution"] = "completed"
                        break
                    if len(tool_calls) != 1:
                        raise ModelFailure("This checkpoint format supports one tool action per turn.")
                    if message.get("content"):
                        # Preserve observable progress text before the action boundary.
                        # The canonical tool-call message is added by _tool, so no
                        # unresolved provider call or future result enters a snapshot.
                        messages.append({"role": "assistant", "content": message["content"]})
                        self._event(run, "agent_message", content=message["content"],
                                    source="live_meta", phase="commentary")
                    function = tool_calls[0]["function"]
                    action = {"tool": function["name"], "arguments": json.loads(function["arguments"])}
                self._tool(run, environment, messages, state, config, action, checkpoints, supervisor=supervisor)
            else:
                raise RuntimeError("Step allowance exhausted. Run is incomplete.")
        except Exception as error:
            run["execution"] = "failed"
            run["error"] = str(error)
            self._event(run, "execution_error", content=str(error), source=config["kind"])
            # Failed calls were logged immediately, even if no message returned.
            own_calls = list(proposal_calls or []) + [c for c in self.store.calls() if c["run_id"] == run["id"]
                                                      and c["purpose"] == "continuation"]
        run["agent_elapsed_ms"] = round((time.perf_counter() - started) * 1000, 2)
        run["final_state"] = environment.snapshot()
        run["conversation"] = clone(messages)
        try:
            run["outcome"] = domains.evaluate(run, environment)
            if run.get("domain") == "coding" and not run.get("verification", {}).get("completed"):
                self._event(run, "execution_error", content=run["error"], source="protected_evaluator")
        except Exception as error:
            run["execution"] = "failed"
            run["error"] = "Verification unavailable: " + str(error)
            self._event(run, "execution_error", content=run["error"], source="protected_evaluator")
            run["outcome"] = {"status": "failed", "passed": 0, "total": 1, "checks": [
                {"id": "verification", "label": "Protected verification completed", "status": "failed",
                 "detail": run["error"], "group": "execution"}],
                "scope": "Verification did not complete; no successful outcome is claimed."}
        run["verification_elapsed_ms"] = round((time.perf_counter() - started) * 1000 - run["agent_elapsed_ms"], 2)
        if supervisor:
            # Include failed reviews from the ledger before checking the remaining allowance.
            own_calls[:] = list(proposal_calls or []) + [
                c for c in self.store.calls() if c["run_id"] == run["id"]]
            try:
                run["supervision"] = supervisor.evaluate(run)
            except Exception as error:
                run["supervision"] = {"status": "unavailable", "error": type(error).__name__}
            own_calls = list(proposal_calls or []) + [
                c for c in self.store.calls() if c["run_id"] == run["id"]]
        run["model_calls"] = clone(own_calls)
        run["usage"] = aggregate_usage(own_calls)
        run["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 2)
        run["state_changes"] = state_diff(run["initial_state"], run["final_state"])
        self.store.save_run(run, checkpoints)
        return run

    def branch(self, run_id: str, checkpoint_id: str, action: dict, continuation: str | None = None,
               proposal_id: str | None = None) -> dict:
        parent = self.store.run(run_id)
        checkpoint = self.store.checkpoint(checkpoint_id)
        if checkpoint["run_id"] != run_id:
            raise ValueError("This checkpoint belongs to another run. Select a checkpoint in the current run.")
        environment, payload = restore(checkpoint)
        action = environment.validate(action)
        kind = continuation or payload["agent_config"]["kind"]
        playground = payload["agent_config"].get("playground", False)
        if kind not in ("deterministic_demo", "live_meta"):
            raise ValueError("Unsupported continuation mode.")
        if payload["agent_config"]["kind"] == "live_meta" and kind != "live_meta":
            raise ValueError("A live-agent checkpoint requires a fresh live continuation.")
        if kind == "live_meta":
            if not meta_status()["available"]:
                raise ModelFailure("Live continuation is unavailable. " + " ".join(meta_status()["blockers"]))
            if (payload["agent_config"]["kind"] == "live_meta"
                    and payload["agent_config"] != self._agent_config(kind, playground)):
                raise ValueError("Live model configuration changed. Restore the original model, endpoint, and bounds or record a new run.")
        proposal_calls = []
        provenance = {"kind": "manual", "failed_trace_access": False}
        if proposal_id:
            proposal = self.store.proposal(proposal_id)
            if (proposal["run_id"] != run_id or proposal["checkpoint_id"] != checkpoint_id
                    or proposal["status"] != "ready" or proposal["action"] != action):
                raise ValueError("Proposal does not match this action and checkpoint. Execute edited arguments as a manual patch.")
            if kind != "live_meta":
                raise ValueError("Meta proposals require a fresh live continuation.")
            proposal_calls = proposal["model_calls"]
            provenance = {"kind": "meta_proposal", "proposal_id": proposal_id, "failed_trace_access": True,
                          "evidence_refs": proposal.get("evidence_refs", []),
                          "explanation": proposal.get("explanation"),
                          "expected_improvement": proposal.get("expected_improvement"),
                          "proposer": proposal.get("provenance", self._model_role("live_meta", "repair_proposer"))}
        run = self._new_run(parent["scenario_id"], kind, parent_id=run_id)
        run["parent_sha256"] = digest(parent)
        run["fork_checkpoint_id"] = checkpoint_id
        run["initial_state"] = clone(parent["initial_state"])
        run["fork_state"] = environment.snapshot()
        run["injected_failure"] = parent["injected_failure"]
        run["patch"] = {"before": payload["pending_action"], "after": action, "provenance": provenance,
                        "continuation": kind, "context_rule": "Only the conversation before this checkpoint is restored."}
        if proposal_id:
            run["model_roles"]["repair_proposer"] = provenance["proposer"]
        run["events"] = [{**clone(event), "inherited": True, "checkpoint_id": None}
                         for event in parent["events"][:payload["event_boundary"]]]
        config = self._agent_config(kind, playground)
        return self._drive(run, environment, payload["conversation"], payload["agent_state"],
                           config, first_action=action, proposal_calls=proposal_calls)

    def restart(self, run_id: str, checkpoint_id: str) -> dict:
        """Fresh decisions from the same boundary, without proposer advice."""
        parent = self.store.run(run_id)
        checkpoint = self.store.checkpoint(checkpoint_id)
        if checkpoint["run_id"] != run_id:
            raise ValueError("The restart checkpoint belongs to another run.")
        environment, payload = restore(checkpoint)
        if not meta_status()["available"]:
            raise ModelFailure("Fresh restart is unavailable. " + " ".join(meta_status()["blockers"]))
        config = self._agent_config("live_meta", payload["agent_config"].get("playground", False))
        if payload["agent_config"]["kind"] == "live_meta" and payload["agent_config"] != config:
            raise ValueError("Live model configuration changed. Record a new run or restore its configuration.")
        run = self._new_run(parent["scenario_id"], "live_meta", parent_id=run_id)
        run.update({"parent_sha256": digest(parent), "fork_checkpoint_id": checkpoint_id,
                    "initial_state": clone(parent["initial_state"]), "fork_state": environment.snapshot(),
                    "injected_failure": False, "source_run_injected_failure": parent["injected_failure"],
                    "restart": {"kind": "checkpoint_restart_without_advice", "checkpoint_id": checkpoint_id,
                                "failed_trace_access": False, "pending_action_discarded": True}})
        run["events"] = [{**clone(event), "inherited": True, "checkpoint_id": None}
                         for event in parent["events"][:payload["event_boundary"]]]
        return self._drive(run, environment, payload["conversation"], payload["agent_state"], config)

    def replay(self, run_id: str) -> dict:
        parent = self.store.run(run_id)
        domain = parent.get("domain", "retail")
        if parent["compatibility"] != domains.compatibility(domain):
            raise ValueError("Incompatible saved run. Record a new run before replaying with the current simulator.")
        run = self._new_run(parent["scenario_id"], "unchanged_replay", run_id)
        run["parent_sha256"] = digest(parent)
        environment = domains.restore_environment(domain, parent["initial_state"])
        run["initial_state"] = environment.snapshot()
        run["injected_failure"] = parent["injected_failure"]
        started = time.perf_counter()
        mismatches = []
        tool_errors = 0
        for event in parent["events"]:
            if event["kind"] == "tool":
                action = {"tool": event["tool"], "arguments": event["arguments"]}
                tool_started = time.perf_counter()
                observation = environment.execute(action)
                self._event(run, "tool", **action, observation=observation, source="unchanged_replay",
                            latency_ms=round((time.perf_counter() - tool_started) * 1000, 2), checkpoint_id=None)
                observed = domains.comparable_observation(domain, observation)
                recorded = domains.comparable_observation(domain, event["observation"])
                if observed != recorded:
                    mismatches.append({"event_seq": event["seq"], "tool": event["tool"],
                                       "differences": state_diff(recorded, observed)})
                tool_errors += not observation["ok"]
            elif event["kind"] in ("user_message", "agent_message"):
                self._event(run, event["kind"], content=event["content"], source="recorded_playback")
        run["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 2)
        run["final_state"] = environment.snapshot()
        state_matches = run["final_state"] == parent["final_state"]
        matches = not mismatches and state_matches
        run["execution"] = "completed" if matches and not tool_errors else "failed"
        run["error"] = None if run["execution"] == "completed" else (
            "Replay reproduced recorded tool error(s)." if matches else "Replay observations or final state did not match.")
        run["replay"] = {"status": "matched" if matches else "mismatch", "observations_match": not mismatches,
                         "state_match": state_matches, "mismatches": mismatches,
                         "tool_errors": tool_errors, "all_tool_calls_reexecuted": True}
        run["conversation"] = []
        run["usage"] = aggregate_usage([])
        run["outcome"] = {"status": "not_evaluated", "passed": 0, "total": 0, "checks": [],
                          "scope": "Tool replay checks observations/state only. Messages are recorded playback, not fresh model output."}
        run["state_changes"] = state_diff(run["initial_state"], run["final_state"])
        if domain == "coding":
            run["file_diffs"] = domains.coding.file_diffs(run["initial_state"]["files"], run["final_state"]["files"])
        self.store.save_run(run, [])
        return run

    def compare(self, branch_id: str) -> dict:
        branch = self.store.run(branch_id)
        if not branch["parent_id"]:
            raise ValueError("Select a branch to compare with its parent.")
        parent = self.store.run(branch["parent_id"])
        result = {"parent_id": parent["id"], "branch_id": branch_id, "patch": branch["patch"],
                "parent_sha256": digest(parent), "original_unchanged": branch.get("parent_sha256") == digest(parent),
                "state_diff": state_diff(parent["final_state"], branch["final_state"]),
                "parent_outcome": parent["outcome"], "branch_outcome": branch["outcome"],
                "parent_usage": parent["usage"], "branch_usage": branch["usage"],
                "parent_elapsed_ms": parent["elapsed_ms"], "branch_elapsed_ms": branch["elapsed_ms"],
                "scope": "An intervention result in this sandbox; not a unique root-cause diagnosis."}
        if branch.get("domain") == "coding":
            result.update({"file_diffs": domains.coding.file_diffs(parent["final_state"]["files"], branch["final_state"]["files"]),
                           "parent_file_diffs": parent.get("file_diffs", []), "branch_file_diffs": branch.get("file_diffs", []),
                           "parent_verification": parent.get("verification"),
                           "branch_verification": branch.get("verification"),
                           "scope": "Frozen coding checks on actual isolated executions. This does not establish general coding-agent recovery."})
        return result

    def propose(self, run_id: str, checkpoint_id: str | None = None) -> dict:
        parent = self.store.run(run_id)
        if parent.get("domain") != "coding":
            if not checkpoint_id:
                raise ValueError("Choose a checkpoint for the retail proposer.")
            return self._legacy_propose(run_id, checkpoint_id)
        from pydantic import ValidationError
        from .repairs import PROPOSER_POLICY, public_context, validate_candidate

        started = time.perf_counter()
        proposal = {"id": "proposal_" + uuid4().hex, "run_id": run_id, "checkpoint_id": None,
                    "created_at": now(), "status": "failed", "action": None, "explanation": None,
                    "evidence_refs": [], "expected_improvement": None, "failed_trace_access": True,
                    "model_calls": [], "error": None, "raw_response": None,
                    "provenance": self._model_role("live_meta", "repair_proposer"),
                    "generation_config": self._agent_config("live_meta")}
        try:
            if not meta_status()["available"]:
                raise ModelFailure("Meta proposals are unavailable. " + " ".join(meta_status()["blockers"]))
            checkpoints = [self.store.checkpoint(item["id"]) for item in parent["checkpoints"]]
            context = public_context(parent, checkpoints, checkpoint_id)
            proposal["context_sha256"] = digest(context)
            proposal["available_checkpoint_ids"] = [item["id"] for item in context["available_checkpoints"]]
            messages = [{"role": "developer", "content": PROPOSER_POLICY},
                        {"role": "user", "content": canonical(context)}]
            spent = sum(call["run_id"] == run_id and call["purpose"] == "proposal" for call in self.store.calls())
            message, call = MetaClient(self.store).complete(messages, [], run_id, "proposal", spent,
                                                          proposal_id=proposal["id"], json_output=True)
            proposal["model_calls"].append(call)
            proposal["raw_response"] = message.get("content")
            raw = json.loads(message["content"])
            proposal.update(validate_candidate(raw, parent, checkpoints))
        except ValidationError as error:
            proposal["error"] = "Invalid repair proposal schema: " + str(error.errors(include_input=False, include_url=False))[:2500]
        except Exception as error:
            proposal["error"] = str(error)[:3000]
        proposal["model_calls"] = [call for call in self.store.calls() if call.get("proposal_id") == proposal["id"]]
        proposal["usage"] = aggregate_usage(proposal["model_calls"])
        proposal["elapsed_ms"] = round((time.perf_counter() - started) * 1000, 2)
        proposal = redact_credentials(proposal)
        self.store.save_proposal(proposal)
        return proposal

    def _legacy_propose(self, run_id: str, checkpoint_id: str) -> dict:
        parent = self.store.run(run_id)
        checkpoint = self.store.checkpoint(checkpoint_id)
        if checkpoint["run_id"] != run_id:
            raise ValueError("Checkpoint belongs to another run.")
        environment, payload = restore(checkpoint)
        if not meta_status()["available"]:
            raise ModelFailure("Meta proposals are unavailable. " + " ".join(meta_status()["blockers"]))
        proposal = {"id": "proposal_" + uuid4().hex, "run_id": run_id, "checkpoint_id": checkpoint_id,
                    "created_at": now(), "status": "failed", "action": None, "explanation": None,
                    "failed_trace_access": True, "model_calls": [], "error": None}
        messages = [
            {"role": "developer", "content": "You are a separate repair proposer. You may inspect the failed trace, "
             "including events after the checkpoint. Propose exactly one replacement tool call. "
             "Return a JSON object with exactly tool (string), arguments (object), explanation (string citing actual observations). "
             "Use only the supplied tools and the user's actual task instructions. "
             "No grader, expected trajectory, or hidden reasoning is available. Do not claim a unique root cause."},
            {"role": "user", "content": canonical({"request": domains.scenario(parent["scenario_id"])["request"],
             "pending_action": payload["pending_action"], "recorded_trace": parent["events"],
             "allowed_tools": environment.schemas()})},
        ]
        try:
            message, call = MetaClient(self.store).complete(messages, [], run_id, "proposal", 0,
                                                          proposal_id=proposal["id"], json_output=True)
            proposal["model_calls"].append(call)
            raw = json.loads(message["content"])
            if set(raw) != {"tool", "arguments", "explanation"} or not isinstance(raw["explanation"], str):
                raise ValueError("Meta returned an invalid patch proposal schema.")
            proposal["action"] = environment.validate({"tool": raw["tool"], "arguments": raw["arguments"]})
            proposal["explanation"] = raw["explanation"]
            proposal["status"] = "ready"
        except Exception as error:
            proposal["error"] = str(error)
            proposal["model_calls"] = [c for c in self.store.calls() if c.get("proposal_id") == proposal["id"]]
        self.store.save_proposal(proposal)
        return proposal

