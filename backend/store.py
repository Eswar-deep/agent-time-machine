import json
import sqlite3
import threading
from pathlib import Path

from .jsonutil import canonical, digest


class NotFound(ValueError):
    pass


class Store:
    def __init__(self, path: Path | str):
        self.path = Path(path)
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = threading.RLock()
        with self.connect() as connection:
            connection.executescript("""
                PRAGMA journal_mode=WAL;
                CREATE TABLE IF NOT EXISTS runs (
                    id TEXT PRIMARY KEY, parent_id TEXT, created_at TEXT NOT NULL,
                    payload TEXT NOT NULL, sha256 TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS checkpoints (
                    id TEXT PRIMARY KEY, run_id TEXT NOT NULL,
                    payload TEXT NOT NULL, sha256 TEXT NOT NULL,
                    FOREIGN KEY(run_id) REFERENCES runs(id)
                );
                CREATE TABLE IF NOT EXISTS proposals (
                    id TEXT PRIMARY KEY, run_id TEXT NOT NULL, checkpoint_id TEXT NOT NULL,
                    payload TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS model_calls (
                    id TEXT PRIMARY KEY, payload TEXT NOT NULL
                );
                CREATE TRIGGER IF NOT EXISTS immutable_runs_update
                BEFORE UPDATE ON runs BEGIN SELECT RAISE(ABORT, 'Saved runs are immutable'); END;
                CREATE TRIGGER IF NOT EXISTS immutable_runs_delete
                BEFORE DELETE ON runs BEGIN SELECT RAISE(ABORT, 'Saved runs are immutable'); END;
            """)

    def connect(self):
        connection = sqlite3.connect(str(self.path), timeout=20)
        connection.execute("PRAGMA foreign_keys=ON")
        return connection

    def save_run(self, run: dict, checkpoints: list[dict]):
        with self.lock, self.connect() as connection:
            connection.execute("INSERT INTO runs VALUES (?,?,?,?,?)",
                               (run["id"], run["parent_id"], run["created_at"], canonical(run), digest(run)))
            connection.executemany("INSERT INTO checkpoints VALUES (?,?,?,?)",
                                   [(c["id"], c["run_id"], canonical(c["payload"]), c["sha256"]) for c in checkpoints])

    def run(self, run_id: str) -> dict:
        with self.connect() as connection:
            row = connection.execute("SELECT payload, sha256 FROM runs WHERE id=?", (run_id,)).fetchone()
        if row is None:
            raise NotFound("Run not found. Select a saved run from the run history.")
        value = json.loads(row[0])
        if digest(value) != row[1]:
            raise ValueError("Saved run checksum mismatch. Select another run or create a new one.")
        return value

    def list_runs(self) -> list[dict]:
        with self.connect() as connection:
            rows = connection.execute("SELECT payload FROM runs ORDER BY created_at DESC").fetchall()
        return [json.loads(row[0]) for row in rows]

    def checkpoint(self, checkpoint_id: str) -> dict:
        with self.connect() as connection:
            row = connection.execute("SELECT run_id, payload, sha256 FROM checkpoints WHERE id=?", (checkpoint_id,)).fetchone()
        if row is None:
            raise NotFound("Checkpoint not found. Select an available tool boundary or record a new run.")
        try:
            payload = json.loads(row[1])
        except (json.JSONDecodeError, TypeError) as error:
            raise ValueError("Checkpoint is unreadable. Record a fresh run in the current app version.") from error
        if digest(payload) != row[2]:
            raise ValueError("Checkpoint checksum mismatch. State was modified or damaged; record a fresh run.")
        return {"id": checkpoint_id, "run_id": row[0], "payload": payload, "sha256": row[2]}

    def save_proposal(self, proposal: dict):
        with self.connect() as connection:
            connection.execute("INSERT INTO proposals VALUES (?,?,?,?)",
                               (proposal["id"], proposal["run_id"], proposal["checkpoint_id"], canonical(proposal)))

    def proposal(self, proposal_id: str) -> dict:
        with self.connect() as connection:
            row = connection.execute("SELECT payload FROM proposals WHERE id=?", (proposal_id,)).fetchone()
        if not row:
            raise NotFound("Proposal not found. Generate a new proposal for the selected checkpoint.")
        return json.loads(row[0])

    def log_model_call(self, call: dict):
        with self.connect() as connection:
            connection.execute("INSERT INTO model_calls VALUES (?,?)", (call["id"], canonical(call)))

    def calls(self) -> list[dict]:
        with self.connect() as connection:
            return [json.loads(row[0]) for row in connection.execute("SELECT payload FROM model_calls")]

