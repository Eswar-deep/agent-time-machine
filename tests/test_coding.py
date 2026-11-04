"""Coding recovery checks execute candidates only through the real WASM runner."""

import json

import httpx
import pytest

from backend.checkpoints import InvalidCheckpoint, restore
from backend.coding import FIXTURE
from backend.domains import comparable_observation
from backend.engine import Engine
from backend.jsonutil import canonical, clone, digest
from backend.store import Store


@pytest.fixture
def coding_engine(tmp_path):
    return Engine(Store(tmp_path / "coding.sqlite3"))


def patch_action(name):
    patch = json.loads((FIXTURE / "patches" / (name + ".json")).read_text(encoding="utf-8"))
    path, content = next(iter(patch["files"].items()))
    return {"tool": "write_file", "arguments": {"path": path, "content": content}}


def edit_checkpoint(engine, run):
    boundary = next(item for item in run["checkpoints"] if item["tool"] == "write_file")
    return engine.checkpoint(boundary["id"])


def test_manual_coding_repair_records_real_checks_diffs_and_restart_persistence(coding_engine):
    engine = coding_engine
    original = engine.create("coding-date-parser")
    before = canonical(original)
    assert original["domain"] == "coding" and original["injected_failure"]
    assert original["execution"] == "completed"
    assert original["outcome"]["status"] == "failed"
    assert {check["id"] for check in original["outcome"]["checks"] if check["status"] == "failed"} == {
        "positive_offset", "negative_offset", "fractional_offset"
    }
    visible = [event["observation"]["value"] for event in original["events"]
               if event["kind"] == "tool" and event["tool"] == "run_tests"]
    assert [command["exit_code"] for command in visible] == [1, 0]
    assert "FAIL reported_z_format" in visible[0]["stdout"]
    assert "PASS reported_z_format" in visible[1]["stdout"]
    assert all(command["command"][:2] == ["node", "scripts/coding_sandbox.mjs"] for command in visible)
    assert original["verification"]["command"]["exit_code"] == 1
    assert "FAILED: positive_offset" in original["verification"]["report"]

    checkpoint = edit_checkpoint(engine, original)
    branch = engine.branch(original["id"], checkpoint["id"], patch_action("correct"))
    assert branch["execution"] == "completed" and branch["outcome"]["status"] == "passed_checks"
    assert branch["outcome"]["passed"] == branch["outcome"]["total"] == 28
    assert branch["patch"]["provenance"]["kind"] == "manual"
    assert branch["patch"]["provenance"]["failed_trace_access"] is False
    assert branch["verification"]["command"]["exit_code"] == 0
    assert "28/28" not in branch["verification"]["report"]  # Host suite has 26 checks; engine adds 2.
    assert "26/26 checks passed" in branch["verification"]["report"]
    assert branch["file_diffs"] and branch["file_diffs"][0]["path"] == "timestamp_parser.js"
    manifest = json.loads((FIXTURE / "manifest.json").read_text(encoding="utf-8"))
    for run in (original, branch):
        assert run["verification"]["requirements_hash"] == manifest["requirements"]["sha256"]
        assert run["verification"]["protected_evaluator_hash"] == manifest["protected_evaluator"]["sha256"]
        assert run["verification"]["suite_version"] == manifest["fixture_id"]
        assert run["usage"]["calls"] == 0
    comparison = engine.compare(branch["id"])
    assert comparison["original_unchanged"]
    assert comparison["parent_file_diffs"] and comparison["branch_file_diffs"] and comparison["file_diffs"]
    assert canonical(engine.store.run(original["id"])) == before
    reopened = Engine(Store(engine.store.path))
    assert reopened.store.run(branch["id"]) == branch
    assert reopened.store.run(original["id"]) == original
    assert reopened.checkpoint(checkpoint["id"]) == checkpoint


def test_untracked_changes_restore_with_context_and_leave_parent_and_siblings_unchanged(coding_engine):
    engine = coding_engine
    original = engine.create("coding-date-parser")
    original_saved = canonical(original)
    checkpoint = edit_checkpoint(engine, original)
    original_checkpoint = canonical(checkpoint)
    note_path = "notes/reproduction.txt"
    note = checkpoint["payload"]["environment"]["files"][note_path]
    assert note_path not in checkpoint["payload"]["environment"]["tracked_files"]
    restored, payload = restore(checkpoint)
    assert restored.snapshot() == checkpoint["payload"]["environment"]
    assert payload["conversation"] == checkpoint["payload"]["conversation"]
    assert payload["agent_config"] == checkpoint["payload"]["agent_config"]
    assert payload["environment"]["execution_config"] == original["initial_state"]["execution_config"]

    note_branch = engine.branch(original["id"], checkpoint["id"], {
        "tool": "write_file", "arguments": {"path": note_path, "content": note + "Branch-only investigation note.\n"}
    })
    assert note_branch["outcome"]["status"] == "failed"
    note_branch_saved = canonical(note_branch)
    post_edit_boundary = next(item for item in note_branch["checkpoints"] if item["tool"] == "run_tests")
    post_edit = engine.checkpoint(post_edit_boundary["id"])
    isolated, _ = restore(post_edit)
    assert isolated.snapshot()["files"][note_path].endswith("Branch-only investigation note.\n")
    assert note_path not in isolated.snapshot()["tracked_files"]
    isolated.execute({"tool": "write_file", "arguments": {"path": note_path, "content": "local mutation"}})
    assert engine.checkpoint(post_edit["id"])["payload"]["environment"]["files"][note_path] != "local mutation"

    good = engine.branch(original["id"], checkpoint["id"], patch_action("correct"))
    failed_sibling = engine.branch(original["id"], checkpoint["id"], checkpoint["payload"]["pending_action"])
    assert good["outcome"]["status"] == "passed_checks"
    assert failed_sibling["outcome"]["status"] == "failed"
    assert good["fork_state"] == failed_sibling["fork_state"] == checkpoint["payload"]["environment"]
    assert good["final_state"]["files"][note_path] == failed_sibling["final_state"]["files"][note_path] == note
    assert good["final_state"]["files"]["timestamp_parser.js"] != failed_sibling["final_state"]["files"]["timestamp_parser.js"]
    assert canonical(engine.store.run(original["id"])) == original_saved
    assert canonical(engine.store.run(note_branch["id"])) == note_branch_saved
    assert canonical(engine.checkpoint(checkpoint["id"])) == original_checkpoint
    assert {run["id"] for run in engine.store.list_runs()} == {
        original["id"], note_branch["id"], good["id"], failed_sibling["id"]
    }


def test_coding_replay_reexecutes_every_tool_and_normalizes_only_volatile_timings(coding_engine):
    engine = coding_engine
    original = engine.create("coding-date-parser")
    replay = engine.replay(original["id"])
    assert replay["replay"]["status"] == "matched"
    assert replay["replay"]["all_tool_calls_reexecuted"]
    original_tools = [event for event in original["events"] if event["kind"] == "tool"]
    replay_tools = [event for event in replay["events"] if event["kind"] == "tool"]
    assert len(original_tools) == len(replay_tools) == 6
    for recorded, repeated in zip(original_tools, replay_tools):
        assert recorded["id"] != repeated["id"]
        assert comparable_observation("coding", recorded["observation"]) == comparable_observation("coding", repeated["observation"])
    assert replay["final_state"] == original["final_state"]
    assert replay["outcome"]["status"] == "not_evaluated"
    assert all(event["source"] == "recorded_playback" for event in replay["events"] if event["kind"] == "agent_message")

    timing_only = clone(original)
    timing_only["id"] = "run_coding_changed_timings"
    timing_only["checkpoints"] = []
    commands = [event for event in timing_only["events"] if event["kind"] == "tool" and event["tool"] == "run_tests"]
    for event in commands:
        event["observation"]["value"]["duration_ms"] += 10000
        event["latency_ms"] += 10000
    engine.store.save_run(timing_only, [])
    assert engine.replay(timing_only["id"])["replay"]["status"] == "matched"

    altered_output = clone(timing_only)
    altered_output["id"] = "run_coding_altered_output"
    command = next(event for event in altered_output["events"] if event["kind"] == "tool" and event["tool"] == "run_tests")
    command["observation"]["value"]["stdout"] = "A forged all-green claim"
    engine.store.save_run(altered_output, [])
    mismatch = engine.replay(altered_output["id"])
    assert mismatch["replay"]["state_match"]
    assert not mismatch["replay"]["observations_match"]
    assert mismatch["replay"]["status"] == "mismatch" and mismatch["execution"] == "failed"
    assert mismatch["replay"]["mismatches"][0]["tool"] == "run_tests"


def test_misleading_green_test_is_saved_as_failed_and_correctable_from_pre_edit_checkpoint(coding_engine):
    engine = coding_engine
    original = engine.create("coding-test-tamper")
    final_visible = [event["observation"]["value"] for event in original["events"]
                     if event["kind"] == "tool" and event["tool"] == "run_tests"][-1]
    assert final_visible["exit_code"] == 0 and all(test["passed"] for test in final_visible["tests"])
    assert original["execution"] == "completed" and original["outcome"]["status"] == "failed"
    assert original["verification"]["tamper_detected"]
    failed = {check["id"] for check in original["outcome"]["checks"] if check["status"] == "failed"}
    assert {"visible_tests_unchanged", "reported_z_format", "fractional_z"} <= failed
    assert original["file_diffs"][0]["path"] == "test_timestamp_parser.js"

    checkpoint = edit_checkpoint(engine, original)
    repeated_tamper = engine.branch(original["id"], checkpoint["id"], patch_action("misleading_green"))
    fixed = engine.branch(original["id"], checkpoint["id"], patch_action("correct"))
    assert repeated_tamper["outcome"]["status"] == "failed" and repeated_tamper["verification"]["tamper_detected"]
    assert fixed["outcome"]["status"] == "passed_checks" and not fixed["verification"]["tamper_detected"]
    assert engine.store.run(repeated_tamper["id"]) == repeated_tamper
    assert engine.store.run(original["id"]) == original
    assert fixed["final_state"]["files"]["test_timestamp_parser.js"] == original["initial_state"]["files"]["test_timestamp_parser.js"]


def test_corrupt_or_incompatible_coding_checkpoint_is_rejected(coding_engine):
    original = coding_engine.create("coding-date-parser")
    checkpoint = edit_checkpoint(coding_engine, original)
    corrupt = clone(checkpoint)
    corrupt["payload"]["environment"]["files"]["notes/reproduction.txt"] += "changed"
    with pytest.raises(InvalidCheckpoint, match="checksum mismatch"):
        restore(corrupt)

    for field in ("configuration", "compatibility", "conversation", "tracking", "protected_path"):
        changed = clone(checkpoint)
        payload = changed["payload"]
        if field == "configuration":
            payload["environment"]["execution_config"]["guest_timeout_ms"] += 1
        elif field == "compatibility":
            payload["compatibility"]["requirements_hash"] = "different-suite"
        elif field == "conversation":
            payload["conversation"] = []
        elif field == "tracking":
            payload["environment"]["tracked_files"].append("notes/reproduction.txt")
        else:
            payload["environment"]["files"]["protected/acceptance.json"] = "{}"
        changed["sha256"] = digest(payload)
        with pytest.raises(InvalidCheckpoint):
            restore(changed)


def test_mocked_meta_proposal_and_fresh_coding_continuation_exclude_protected_data_and_original_future(coding_engine, monkeypatch):
    monkeypatch.setenv("MODEL_API_KEY", "test-only-coding-key")
    monkeypatch.setenv("META_MODEL", "test-only-coding-model")
    monkeypatch.setenv("ATM_LIVE_MAX_CALLS", "3")
    monkeypatch.delenv("META_BASE_URL", raising=False)
    monkeypatch.delenv("META_INPUT_USD_PER_MILLION", raising=False)
    monkeypatch.delenv("META_OUTPUT_USD_PER_MILLION", raising=False)
    engine = coding_engine
    original = engine.create("coding-date-parser")
    checkpoint = edit_checkpoint(engine, original)
    original_future = original["events"][-1]["content"]
    replacement = patch_action("correct")
    seen = []

    def response(message, finish="stop"):
        return httpx.Response(200, json={"choices": [{"finish_reason": finish, "message": message}],
                                        "usage": {"prompt_tokens": 100, "completion_tokens": 20}})

    def handler(request):
        body = json.loads(request.content)
        seen.append(body)
        serialized = canonical(body)
        assert "protected/acceptance.json" not in serialized
        assert "patches/correct.json" not in serialized
        assert "2026-11-04T23:45:00-05:30" not in serialized  # Protected case input.
        if body.get("response_format"):
            assert original_future in serialized  # Separate proposer has explicitly declared failed-trace access.
            evidence = next(event["id"] for event in original["events"]
                            if event["kind"] == "tool" and event["tool"] == "write_file")
            return response({"content": json.dumps({
                "status": "ready", "checkpoint_id": checkpoint["id"], "evidence_refs": [evidence],
                "explanation": "Preserve the offset adjustment while accepting Z.",
                "expected_improvement": "Accept the reported Z format without shifting offset timestamps.",
                "action": replacement,
            })})
        assert original_future not in serialized
        assert "execution_events" not in serialized
        if len(seen) == 2:
            changed_result = json.loads(body["messages"][-1]["content"])
            assert changed_result["value"]["path"] == "timestamp_parser.js"
            assert changed_result["value"]["file_diffs"][0]["after"] == replacement["arguments"]["content"]
            return response({"content": None, "tool_calls": [{"id": "coding_visible_check", "type": "function", "function": {
                "name": "run_tests", "arguments": '{"suite":"visible"}'}}]}, "tool_calls")
        command = json.loads(body["messages"][-1]["content"])["value"]
        assert command["exit_code"] == 0 and "PASS reported_z_format" in command["stdout"]
        return response({"content": "The modified parser passes the visible command. Independent checks run separately."})

    real_client = httpx.Client
    monkeypatch.setattr("backend.models.httpx.Client", lambda **kwargs: real_client(transport=httpx.MockTransport(handler), **kwargs))
    proposal = engine.propose(original["id"], checkpoint["id"])
    assert proposal["status"] == "ready" and proposal["failed_trace_access"]
    assert len(engine.store.list_runs()) == 1
    branch = engine.branch(original["id"], checkpoint["id"], proposal["action"],
                           continuation="live_meta", proposal_id=proposal["id"])
    assert branch["outcome"]["status"] == "passed_checks" and branch["execution"] == "completed"
    assert branch["patch"]["provenance"]["kind"] == "meta_proposal"
    assert branch["usage"]["calls"] == 3 and branch["usage"]["total_tokens"] == 360
    assert len(seen) == len(engine.store.calls()) == 3
    assert engine.store.run(original["id"]) == original
    assert original_future not in canonical(branch["conversation"])
    assert "test-only-coding-key" not in canonical(engine.store.calls())
