from fastapi.testclient import TestClient

from backend.api import create_app
from backend.jsonutil import digest


def test_complete_http_journey_and_restart(tmp_path):
    database = tmp_path / "http.sqlite3"
    with TestClient(create_app(database, seed=False)) as client:
        assert client.get("/api/health").status_code == 200
        response = client.post("/api/runs", json={"scenario_id": "cancel-order"})
        assert response.status_code == 201
        original = response.json()
        cp_id = original["checkpoints"][-1]["id"]
        cp = client.get("/api/checkpoints/" + cp_id).json()
        arguments = {**cp["payload"]["pending_action"]["arguments"], "order_id": "#W1048201"}
        branch = client.post(f"/api/runs/{original['id']}/branches", json={
            "checkpoint_id": cp_id, "tool": "cancel_pending_order", "arguments": arguments}).json()
        assert branch["outcome"]["status"] == "passed_checks"
        comparison = client.get(f"/api/runs/{branch['id']}/compare").json()
        assert comparison["original_unchanged"]
        export = client.get(f"/api/runs/{branch['id']}/export")
        assert export.json()["checkpoints"]
        assert export.headers["content-disposition"].startswith("attachment;")
        cp["payload"]["format_version"] = 999
        cp["sha256"] = digest(cp["payload"])
        rejected = client.post("/api/checkpoints/validate", json={"checkpoint": cp})
        assert rejected.status_code == 422
        assert "Unsupported checkpoint format" in rejected.json()["detail"]
        incomplete = client.post("/api/checkpoints/validate", json={"checkpoint": {}})
        assert incomplete.status_code == 422
        assert "incomplete" in incomplete.json()["detail"]
        assert client.get("/api/checkpoints/missing").status_code == 404
        assert client.get("/api/runs/" + original["id"]).json() == original
    with TestClient(create_app(database, seed=False)) as reopened:
        assert reopened.get("/api/runs/" + branch["id"]).json() == branch


def test_unknown_tool_and_external_origin_are_rejected(tmp_path):
    with TestClient(create_app(tmp_path / "api.sqlite3")) as client:
        original = client.get("/api/runs").json()[0]
        run = client.get("/api/runs/" + original["id"]).json()
        response = client.post(f"/api/runs/{run['id']}/branches", json={
            "checkpoint_id": run["checkpoints"][-1]["id"], "tool": "send_email", "arguments": {}})
        assert response.status_code == 422
        forbidden = client.post("/api/runs", headers={"Origin": "https://unrelated.example"},
                                json={"scenario_id": "cancel-order"})
        assert forbidden.status_code == 403

