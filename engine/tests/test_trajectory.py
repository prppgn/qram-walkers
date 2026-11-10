"""Trajectory JSON: round trip, validation, narration, ghosts, golden file (n ≤ 2)."""

from __future__ import annotations

import json
import os
from dataclasses import replace
from pathlib import Path

import pytest

from qramsim import InputTerm, RecordOptions, RunConfig, Trajectory, simulate
from qramsim.geometry import all_addresses
from qramsim.presets import PRESETS, get_preset
from qramsim.trajectory import validate

from helpers import config

GOLDEN = Path(__file__).parent / "golden"


def test_json_round_trip() -> None:
    cfg = config(2, 2, tuple(InputTerm(a, 1) for a in all_addresses(2)), frames=True)
    traj = simulate(cfg).trajectory
    text = traj.to_json()
    back = Trajectory.from_json(text)
    assert back == traj
    assert back.to_dict() == json.loads(text)
    assert validate(json.loads(text)) == []


def test_run_config_round_trip() -> None:
    for preset in PRESETS.values():
        cfg = preset.config
        assert RunConfig.from_dict(json.loads(json.dumps(cfg.to_dict()))) == cfg


def test_frames_structure() -> None:
    result = simulate(get_preset("E2").config)
    traj = result.trajectory
    T_total = traj.meta["phases"]["T_total"]
    assert len(traj.frames) == T_total + 1
    assert [f.t for f in traj.frames] == list(range(-1, T_total))
    phases = [f.phase for f in traj.frames]
    T_fwd, T_q = traj.meta["phases"]["T_fwd"], traj.meta["phases"]["T_q"]
    assert phases == ["init"] + ["routing"] * T_fwd + ["query"] * T_q + ["inverse"] * T_fwd
    # stable branch ids, sorted, one per input term
    for f in traj.frames:
        assert [b.id for b in f.branches] == [0, 1]
    gate_ids = {g["id"] for g in traj.meta["gates"]}
    kinds = set()
    for _, e in traj.events():
        kinds.add(e["kind"])
        assert isinstance(e["text"], str) and e["text"]  # narration for every event
        if e["kind"] == "gate":
            assert e["gate"] in gate_ids
    assert kinds == {"phase", "gate", "scatter", "inject", "exit", "turn"}


def test_ghosts_recorded_for_empty_slots() -> None:
    cfg = get_preset("E1").config
    traj = simulate(cfg).trajectory
    for f in traj.frames:
        a2 = f.branches[0].walkers[1]  # A_2 is empty in E1
        assert a2.s == "E" and a2.pos is None and a2.ghost is not None
    # the ghost of A_2 is flipped by Û⁽¹⁾ with the data and travels with them to (2,2)
    gate_events = [e for _, e in traj.events() if e["kind"] == "gate" and e["gate"] == "U1"]
    assert any(c.get("ghost") and c["k"] == 1 for c in gate_events[0]["changes"])
    no_ghosts = simulate(replace(cfg, record=RecordOptions(ghosts=False))).trajectory
    assert all(w.ghost is None for f in no_ghosts.frames for b in f.branches for w in b.walkers)


def test_validate_rejects_bad_input() -> None:
    traj = simulate(get_preset("E1").config).trajectory.to_dict()
    assert validate(traj) == []
    assert validate({**traj, "schema": "qramsim.traj/2"})
    assert validate({**traj, "frames": traj["frames"][:-1]})
    with pytest.raises(ValueError):
        Trajectory.from_dict({**traj, "schema": "other"})


@pytest.mark.parametrize("preset", ["E1", "E3"])
def test_golden_trajectory(preset: str) -> None:
    """Regression against small committed trajectories (set QRAMSIM_UPDATE_GOLDEN=1)."""
    traj = simulate(get_preset(preset).config).trajectory.to_dict()
    path = GOLDEN / f"{preset}.traj.json"
    if os.environ.get("QRAMSIM_UPDATE_GOLDEN"):
        path.write_text(json.dumps(traj, indent=1, ensure_ascii=False) + "\n", encoding="utf-8")
    golden = json.loads(path.read_text(encoding="utf-8"))
    assert traj == golden
