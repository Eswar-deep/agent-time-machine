"""Virtual file additions/deletions survive checkpoints without affecting siblings."""

import pytest

from backend.checkpoints import restore
from backend.coding import CodingEnvironment, initial_state
from backend.engine import Engine
from backend.environment import InvalidAction
from backend.jsonutil import canonical
from backend.store import Store


def write(path, content):
    return {"tool": "write_file", "arguments": {"path": path, "content": content}}


def delete(path):
    return {"tool": "delete_file", "arguments": {"path": path}}


def test_deleted_tracked_and_untracked_paths_round_trip_with_baseline_index():
    environment = CodingEnvironment(initial_state())
    baseline = environment.snapshot()
    for path, tracked in (("README.md", True), ("notes/reproduction.txt", False)):
        result = environment.execute(delete(path))
        assert result["ok"] and result["value"]["deleted"] is True
        assert result["value"]["tracked"] is tracked
        diff = result["value"]["file_diffs"][0]
        assert diff["path"] == path and diff["before"] == baseline["files"][path]
        assert diff["after"] is None and "+++ /dev/null" in diff["unified_diff"]
        saved = environment.snapshot()
        assert path not in saved["files"]
        assert saved["tracked_files"] == baseline["tracked_files"]
        assert CodingEnvironment(saved).snapshot() == saved

    # Recreating a deleted tracked path retains its original tracked identity.
    assert environment.execute(write("README.md", baseline["files"]["README.md"]))["ok"]
    readme = environment.execute({"tool": "read_file", "arguments": {"path": "README.md"}})
    assert readme["value"]["tracked"] is True


@pytest.mark.parametrize("path", [
    "timestamp_parser.js", "test_timestamp_parser.js", "missing.txt",
    "../outside.txt", "protected/acceptance.json", "C:/outside.txt",
])
def test_invalid_deletion_is_rejected_before_snapshot_mutation(path):
    environment = CodingEnvironment(initial_state())
    before = canonical(environment.snapshot())
    with pytest.raises(InvalidAction):
        environment.validate(delete(path))
    with pytest.raises(InvalidAction):
        environment.execute(delete(path))
    assert canonical(environment.snapshot()) == before


def test_added_edited_and_deleted_files_restore_in_independent_saved_branches(tmp_path):
    engine = Engine(Store(tmp_path / "file-changes.sqlite3"))
    original = engine.create("coding-date-parser")
    original_saved = canonical(original)
    boundary = next(item for item in original["checkpoints"] if item["step"] == 3)
    initial_checkpoint = engine.checkpoint(boundary["id"])
    initial_saved = canonical(initial_checkpoint)
    added_path = "notes/branch-investigation.txt"
    added_content = "Created only in the alternative execution.\n"

    # The intervention replaces read_file at step 3. The next test boundary
    # captures the newly added untracked file before any subsequent action.
    added = engine.branch(original["id"], boundary["id"], write(added_path, added_content))
    added_saved = canonical(added)
    post_add_boundary = next(item for item in added["checkpoints"] if item["step"] == 4)
    post_add = engine.checkpoint(post_add_boundary["id"])
    post_add_saved = canonical(post_add)
    added_environment, added_payload = restore(post_add)
    added_snapshot = added_environment.snapshot()
    assert added_snapshot["files"][added_path] == added_content
    assert added_path not in added_snapshot["tracked_files"]
    assert added_payload["conversation"] == post_add["payload"]["conversation"]
    assert added_payload["agent_config"] == post_add["payload"]["agent_config"]
    assert added_snapshot["execution_config"] == initial_checkpoint["payload"]["environment"]["execution_config"]

    # Siblings start from exactly the same saved state. One deletes a tracked
    # document; the other edits it. Neither can mutate its parent or sibling.
    deleted = engine.branch(added["id"], post_add["id"], delete("README.md"))
    deleted_saved = canonical(deleted)
    edited_content = added_snapshot["files"]["README.md"] + "\nSibling-only edit.\n"
    edited = engine.branch(added["id"], post_add["id"], write("README.md", edited_content))
    assert deleted["fork_state"] == edited["fork_state"] == added_snapshot
    assert "README.md" not in deleted["final_state"]["files"]
    assert "README.md" in deleted["final_state"]["tracked_files"]
    assert edited["final_state"]["files"]["README.md"] == edited_content
    assert deleted["final_state"]["files"][added_path] == edited["final_state"]["files"][added_path] == added_content

    # The post-delete run_tests checkpoint restores the absent tracked path,
    # its baseline tracking identity, the addition, and ordinary agent context.
    post_delete_boundary = next(item for item in deleted["checkpoints"] if item["step"] == 6)
    post_delete = engine.checkpoint(post_delete_boundary["id"])
    reopened = Engine(Store(engine.store.path))
    restored, payload = restore(reopened.checkpoint(post_delete["id"]))
    assert restored.snapshot() == post_delete["payload"]["environment"]
    assert "README.md" not in restored.snapshot()["files"]
    assert "README.md" in restored.snapshot()["tracked_files"]
    assert restored.snapshot()["files"][added_path] == added_content
    assert payload["pending_action"] == {"tool": "run_tests", "arguments": {"suite": "visible"}}
    assert payload["conversation"] == post_delete["payload"]["conversation"]
    assert restored.execute(write("README.md", "A local mutation after restore.\n"))["ok"]
    assert canonical(reopened.store.run(original["id"])) == original_saved
    assert canonical(reopened.store.run(added["id"])) == added_saved
    assert canonical(reopened.store.run(deleted["id"])) == deleted_saved
    assert canonical(reopened.checkpoint(initial_checkpoint["id"])) == initial_saved
    assert canonical(reopened.checkpoint(post_add["id"])) == post_add_saved
    assert "README.md" not in reopened.checkpoint(post_delete["id"])["payload"]["environment"]["files"]
