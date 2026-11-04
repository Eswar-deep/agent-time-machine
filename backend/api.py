import os
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Literal

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[1]
load_dotenv(ROOT / ".env", override=False)

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse  # noqa: E402
from fastapi.staticfiles import StaticFiles  # noqa: E402
from pydantic import BaseModel, ConfigDict, Field  # noqa: E402

from .checkpoints import restore  # noqa: E402
from . import domains  # noqa: E402
from .coding_runtime import SandboxUnavailable, runtime_signature  # noqa: E402
from .engine import Engine  # noqa: E402
from .environment import COMMIT  # noqa: E402
from .models import ModelFailure, aggregate_usage, meta_status  # noqa: E402
from .redaction import redact_credentials  # noqa: E402
from .store import NotFound, Store  # noqa: E402


class Input(BaseModel):
    model_config = ConfigDict(extra="forbid")


class NewRun(Input):
    scenario_id: str = Field(max_length=100)
    mode: Literal["deterministic_demo", "live_meta"] = "deterministic_demo"


class NewExperiment(Input):
    scenario_id: Literal["coding-date-parser"] = "coding-date-parser"
    variant_instruction: str = Field(min_length=1, max_length=1200)


class NewBranch(Input):
    checkpoint_id: str = Field(max_length=100)
    tool: str = Field(max_length=100)
    arguments: dict
    continuation: Literal["deterministic_demo", "live_meta"] | None = None
    proposal_id: str | None = Field(default=None, max_length=100)


class NewProposal(Input):
    checkpoint_id: str | None = Field(default=None, max_length=100)


class NewRestart(Input):
    checkpoint_id: str = Field(max_length=100)


class ValidateCheckpoint(Input):
    checkpoint: dict


def summary(run):
    return {"domain": run.get("domain", "retail"), **{key: run[key] for key in (
        "id", "parent_id", "created_at", "scenario_id", "title", "mode",
        "injected_failure", "execution", "outcome", "elapsed_ms", "usage", "replay",
    )}}


def create_app(database: Path | str | None = None, seed: bool = True) -> FastAPI:
    store = Store(database or os.getenv("ATM_DATABASE", str(ROOT / "data" / "agent-time-machine.sqlite3")))
    engine = Engine(store)

    @asynccontextmanager
    async def lifespan(_app):
        if seed and not any(run.get("domain") == "coding" for run in store.list_runs()):
            try:
                engine.create("coding-date-parser")
            except (SandboxUnavailable, ValueError) as error:
                _app.state.coding_startup_error = str(error)
        yield

    app = FastAPI(title="Agent Time Machine", version="0.1.0", lifespan=lifespan)
    app.state.engine = engine
    app.state.store = store
    app.add_middleware(CORSMiddleware, allow_origins=["http://127.0.0.1:5173", "http://localhost:5173"],
                       allow_methods=["GET", "POST"], allow_headers=["Content-Type"])

    @app.middleware("http")
    async def local_requests(request: Request, call_next):
        if request.url.path.startswith("/api") and request.method == "POST":
            origin = request.headers.get("origin")
            allowed = {"http://127.0.0.1:5173", "http://localhost:5173",
                       "http://127.0.0.1:8000", "http://localhost:8000"}
            if origin and origin not in allowed:
                return JSONResponse(status_code=403, content={"detail": "Use the local app to execute a run."})
            length = request.headers.get("content-length", "0")
            if not length.isdigit() or int(length) > 1_000_000:
                return JSONResponse(status_code=413, content={"detail": "Request exceeds the 1 MB local import limit."})
        return await call_next(request)

    @app.exception_handler(NotFound)
    async def missing(_request, error):
        return JSONResponse(status_code=404, content={"detail": str(error)})

    @app.exception_handler(ModelFailure)
    async def model_failure(_request, error):
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @app.exception_handler(SandboxUnavailable)
    async def sandbox_failure(_request, error):
        return JSONResponse(status_code=409, content={"detail": str(error)})

    @app.exception_handler(ValueError)
    async def invalid(_request, error):
        return JSONResponse(status_code=422, content={"detail": str(error)})

    @app.get("/api/health")
    def health():
        try:
            coding = {"available": True, "runtime": runtime_signature(), "primary_scenario": "coding-date-parser"}
        except Exception as error:
            coding = {"available": False, "reason": str(error)}
        return {"status": "ready", "simulator": "Coding WASM sandbox + pinned tau2 retail tools", "commit": COMMIT,
                "coding": coding,
                "meta": meta_status(), "validation_archive": "not_available",
                "model_ledger": aggregate_usage(store.calls())}

    @app.get("/api/scenarios")
    def scenarios():
        return domains.catalog()

    @app.get("/api/runs")
    def runs():
        return [summary(run) for run in store.list_runs()]

    @app.post("/api/runs", status_code=201)
    def new_run(body: NewRun):
        return engine.create(body.scenario_id, body.mode)

    @app.post("/api/experiments", status_code=201)
    def new_experiment(body: NewExperiment):
        result = engine.experiment(body.scenario_id, body.variant_instruction)
        for arm in ("baseline", "variant"):
            run = result[arm]
            result[arm] = {**summary(run), "supervision": run["supervision"],
                           "tool_calls": sum(event["kind"] == "tool" for event in run["events"]),
                           "blocked_actions": sum(event.get("decision") == "block" for event in run["events"])}
        return redact_credentials(result)

    @app.get("/api/runs/{run_id}")
    def get_run(run_id: str):
        return store.run(run_id)

    @app.get("/api/runs/{run_id}/export")
    def export_run(run_id: str):
        run = store.run(run_id)
        parent = store.run(run["parent_id"]) if run.get("parent_id") else None
        related = store.proposals(parent["id"] if parent else run_id)
        proposal_id = (run.get("patch") or {}).get("provenance", {}).get("proposal_id")
        payload = {"format": "agent-time-machine-export-v1", "run": run,
                   "checkpoints": [store.checkpoint(c["id"]) for c in run["checkpoints"]],
                   "parent": parent, "proposals": related,
                   "proposal": store.proposal(proposal_id) if proposal_id else None,
                   "fork_checkpoint": store.checkpoint(run["fork_checkpoint_id"]) if run.get("fork_checkpoint_id") else None}
        relevant_ids = {run_id, parent["id"] if parent else run_id}
        payload["model_calls"] = [call for call in store.calls() if call["run_id"] in relevant_ids]
        safe_payload = redact_credentials(payload)
        if safe_payload != payload:
            safe_payload["credential_redaction_applied"] = True
            safe_payload["restoration_notice"] = "Redacted checkpoint source may not match its original checksum; do not bypass validation."
        return JSONResponse(content=safe_payload,
                            headers={"Content-Disposition": f'attachment; filename="{run_id}.json"'})

    @app.get("/api/runs/{run_id}/compare")
    def compare_run(run_id: str):
        return engine.compare(run_id)

    @app.post("/api/runs/{run_id}/branches", status_code=201)
    def branch_run(run_id: str, body: NewBranch):
        return engine.branch(run_id, body.checkpoint_id, {"tool": body.tool, "arguments": body.arguments},
                             body.continuation, body.proposal_id)

    @app.post("/api/runs/{run_id}/restarts", status_code=201)
    def restart_run(run_id: str, body: NewRestart):
        return engine.restart(run_id, body.checkpoint_id)

    @app.post("/api/runs/{run_id}/replay", status_code=201)
    def replay_run(run_id: str):
        return engine.replay(run_id)

    @app.post("/api/runs/{run_id}/proposals", status_code=201)
    def propose(run_id: str, body: NewProposal):
        return engine.propose(run_id, body.checkpoint_id)

    @app.get("/api/runs/{run_id}/proposals")
    def proposal_history(run_id: str):
        return redact_credentials(store.proposals(run_id))

    @app.get("/api/proposals/{proposal_id}")
    def get_proposal(proposal_id: str):
        return redact_credentials(store.proposal(proposal_id))

    @app.get("/api/checkpoints/{checkpoint_id}")
    def get_checkpoint(checkpoint_id: str):
        return engine.checkpoint(checkpoint_id)

    @app.post("/api/checkpoints/validate")
    def validate_checkpoint(body: ValidateCheckpoint):
        restore(body.checkpoint)
        return {"status": "compatible", "detail": "Checksum, format, simulator, code, policy, schemas, and agent state match."}

    @app.get("/api/model-calls")
    def model_calls():
        calls = store.calls()
        return {"calls": redact_credentials(calls), "usage": aggregate_usage(calls),
                "scope": "Every attempted provider request, including failed proposals and branches. No hidden reasoning."}

    dist = ROOT / "dist"
    if dist.is_dir():
        app.mount("/", StaticFiles(directory=dist, html=True), name="interface")
    return app


app = create_app()

