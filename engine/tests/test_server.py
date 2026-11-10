"""HTTP API used by the viewer (DESIGN.md §3.7)."""

from __future__ import annotations

from fastapi.testclient import TestClient

from qramsim.presets import get_preset
from qramsim.server import create_app
from qramsim.trajectory import validate

client = TestClient(create_app(None))


def test_health_presets_schema() -> None:
    assert client.get("/api/health").json()["status"] == "ok"
    names = [p["name"] for p in client.get("/api/presets").json()]
    assert names[:3] == ["E1", "E1b", "E2"]
    schema = client.get("/api/schema").json()
    assert schema["run"]["$id"] == "qramsim.run/1"
    assert schema["traj"]["$id"] == "qramsim.traj/1"


def test_simulate_preset() -> None:
    cfg = get_preset("E2").config.to_dict()
    resp = client.post("/api/simulate", json=cfg)
    assert resp.status_code == 200
    traj = resp.json()
    assert validate(traj) == []
    assert traj["final"]["metrics"]["fidelity"] > 1 - 1e-12
    names = [c["name"] for c in traj["final"]["checkpoints"]]
    assert names[0] == "ψ_in" and names[-2:] == ["ψ_out", "output"]
    marks = traj["meta"]["marks"]["level"]
    assert [m["t"] for m in marks] == sorted(m["t"] for m in marks)
    assert len(marks) == 2 * traj["meta"]["n"]


def test_simulate_errors() -> None:
    bad = get_preset("E1").config.to_dict()
    bad["input"]["terms"][0]["address"] = "1"
    resp = client.post("/api/simulate", json=bad)
    assert resp.status_code == 400 and "address" in resp.json()["detail"]
    big = {**get_preset("E1").config.to_dict(), "n": 9}
    big["input"] = {"terms": [{"address": "0" * 9, "amp": [1, 0]}]}
    big["memory"] = {"fill": "zeros"}
    assert client.post("/api/simulate", json=big).status_code == 400
    assert (
        client.post(
            "/api/ensemble", json={"config": get_preset("E1").config.to_dict(), "runs": 0}
        ).status_code
        == 400
    )


def test_ensemble() -> None:
    cfg = get_preset("E2").config.to_dict()
    cfg["noise"] = [{"model": "loss", "p": 0.05, "where": ["propagation"]}]
    resp = client.post("/api/ensemble", json={"config": cfg, "runs": 30, "seed0": 2})
    assert resp.status_code == 200
    body = resp.json()
    assert body["runs"] == 30 and 0 <= body["mean"]["fidelity"] < 1
    assert body["sem"]["fidelity"] >= 0
