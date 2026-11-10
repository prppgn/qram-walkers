"""Noise (PLAN.md Phase 3, DESIGN.md §4, DECISIONS D21, D26, D27).

Acceptance: Kraus completeness for every channel; p = 0 reproduces the ideal trajectory
bitwise; loss with p = 1 ends with no walkers; fidelity decreases with p on average
(fixed seeds). Plus: quantum-jump statistics and back-action, the classical error
models, strays created by a copy on an untracked site and the collision rule.
"""

from __future__ import annotations

import itertools
from dataclasses import replace
from typing import Any

import numpy as np
import pytest

from qramsim import InputTerm, Options, RecordOptions, RunConfig, simulate
from qramsim.config import ConfigError, input_terms
from qramsim.noise import MODELS, STOCHASTIC, kraus_matrix, kraus_ops, parse_noise
from qramsim.simulator import Simulator
from qramsim.sweeps import run_ensemble
from qramsim.trajectory import Trajectory, validate


def cfg(
    variant: str = "basic",
    n: int = 2,
    m: int = 1,
    terms: tuple[InputTerm, ...] | None = None,
    noise: tuple[dict[str, Any], ...] = (),
    seed: int = 0,
    frames: bool = False,
    memory: tuple[tuple[int, ...], ...] | None = None,
) -> RunConfig:
    return RunConfig(
        variant=variant,
        n=n,
        m=m,
        copy_mode="backup" if variant == "backup" else "global",
        terms=terms if terms is not None else input_terms("uniform", n),
        memory=memory,
        memory_fill="random",
        memory_seed=1,
        noise=noise,
        seed=seed,
        record=RecordOptions(frames=frames),
    )


# -- channels ---------------------------------------------------------------------------


@pytest.mark.parametrize("model", sorted(STOCHASTIC))
@pytest.mark.parametrize("p", [0.0, 0.01, 0.3, 1.0])
def test_kraus_completeness(model: str, p: float) -> None:
    ops = kraus_ops(model, p)
    total = sum(kraus_matrix(k).conj().T @ kraus_matrix(k) for k in ops)
    assert np.allclose(total, np.eye(3), atol=1e-14)


def test_channel_definitions() -> None:
    """DESIGN.md §4.2 tables on the basis (∅, R, B)."""
    E, R, B = 0, 1, 2
    loss = [kraus_matrix(k) for k in kraus_ops("loss", 0.25)]
    assert np.allclose(loss[0], np.diag([1, np.sqrt(0.75), np.sqrt(0.75)]))
    assert loss[1][E, R] == pytest.approx(0.5) and loss[2][E, B] == pytest.approx(0.5)
    z = kraus_matrix(kraus_ops("colour_dephasing", 0.5)[1])
    assert np.allclose(z, np.sqrt(0.5) * np.diag([1, 1, -1]))
    zp = kraus_matrix(kraus_ops("presence_dephasing", 0.5)[1])
    assert np.allclose(zp, np.sqrt(0.5) * np.diag([-1, 1, 1]))
    flip = kraus_matrix(kraus_ops("bit_flip", 1.0)[1])
    assert flip[B, R] == 1 and flip[R, B] == 1 and flip[E, E] == 1
    dep = [kraus_matrix(k) for k in kraus_ops("depolarizing", 0.4)]
    assert len(dep) == 4 and dep[0][E, E] == 1  # identity on ∅
    assert set(MODELS) >= {
        "loss",
        "bit_flip",
        "colour_dephasing",
        "presence_dephasing",
        "depolarizing",
        "scatter_flip",
        "gate_failure",
        "clock_jitter",
        "copy_error",
        "memory_bit_flip",
    }


def test_parse_validation() -> None:
    sim = Simulator(cfg())
    with pytest.raises(ConfigError):
        parse_noise([{"model": "nope", "p": 0.1}], sim.variant)
    with pytest.raises(ConfigError):
        parse_noise([{"model": "loss", "p": 1.5}], sim.variant)
    with pytest.raises(ConfigError):
        parse_noise([{"model": "loss", "p": 0.1, "where": ["sky"]}], sim.variant)
    with pytest.raises(ConfigError):
        parse_noise([{"model": "loss", "p": 0.1, "targets": ["Z_9"]}], sim.variant)
    with pytest.raises(ConfigError):
        parse_noise([{"model": "clock_jitter", "p_early": 0.7, "p_late": 0.6}], sim.variant)
    (ch,) = parse_noise([{"model": "loss", "p": 0.1, "targets": "data"}], sim.variant)
    assert sorted(sim.variant.slots[k].name for k in ch.targets) == ["D_1"]
    (ch,) = parse_noise([{"model": "loss", "p": 0.1, "targets": "flag"}], sim.variant)
    assert [sim.variant.slots[k].name for k in ch.targets] == ["D_0"]
    (sf,) = parse_noise([{"model": "scatter_flip", "p": 0.1}], sim.variant)
    assert sf.where == frozenset({"scattering"})


# -- acceptance --------------------------------------------------------------------------

ALL_AT_ZERO = (
    {"model": "loss", "p": 0.0, "where": ["propagation", "gate", "idle"]},
    {"model": "bit_flip", "p": 0.0, "where": ["gate", "memory"]},
    {"model": "colour_dephasing", "p": 0.0},
    {"model": "presence_dephasing", "p": 0.0},
    {"model": "depolarizing", "p": 0.0},
    {"model": "scatter_flip", "p": 0.0},
    {"model": "gate_failure", "p": 0.0},
    {"model": "clock_jitter", "p_early": 0.0, "p_late": 0.0},
    {"model": "copy_error", "p": 0.0},
    {"model": "memory_bit_flip", "p": 0.0},
)


@pytest.mark.parametrize("variant", ["basic", "backup"])
def test_p_zero_is_the_ideal_run_bitwise(variant: str) -> None:
    ideal = simulate(cfg(variant, frames=True)).trajectory
    noisy = simulate(cfg(variant, noise=ALL_AT_ZERO, seed=123, frames=True)).trajectory
    assert noisy.frames == ideal.frames
    assert noisy.final["state"] == ideal.final["state"]
    assert noisy.final["metrics"] == ideal.final["metrics"]


@pytest.mark.parametrize("variant", ["basic", "backup"])
def test_loss_one_loses_everything(variant: str) -> None:
    noise = ({"model": "loss", "p": 1.0, "where": ["propagation"], "targets": "all"},)
    result = simulate(cfg(variant, n=3, m=2, noise=noise, seed=5))
    for br in result.final:
        assert not any(br.present)
    assert result.metrics["fidelity"] == 0.0
    assert result.metrics["success"] == 0.0


@pytest.mark.parametrize("variant", ["basic", "backup"])
def test_fidelity_decreases_with_loss(variant: str) -> None:
    means = []
    for p in (0.0, 0.005, 0.02, 0.06):
        noise = ({"model": "loss", "p": p, "where": ["propagation"]},)
        ens = run_ensemble(cfg(variant, n=2, m=1, noise=noise), runs=80, seed0=1000, workers=1)
        means.append(ens.mean["fidelity"])
    assert means[0] == 1.0
    assert all(a > b for a, b in itertools.pairwise(means)), means


# -- quantum jumps -----------------------------------------------------------------------


def single_crossing_loss(p: float, terms: tuple[InputTerm, ...], seed: int) -> Any:
    """Loss on A_1 only, at its single routing crossing (n = 1)."""
    noise = (
        {
            "model": "loss",
            "p": p,
            "where": ["scattering"],
            "targets": ["A_1"],
            "phases": ["routing"],
        },
    )
    return simulate(cfg(n=1, m=1, terms=terms, noise=noise, seed=seed, frames=True))


def test_jump_frequency() -> None:
    lost = 0
    runs = 400
    for seed in range(runs):
        r = single_crossing_loss(0.3, (InputTerm("1", 1),), seed)
        lost += any(e["kind"] == "noise" for _, e in r.trajectory.events())
    assert abs(lost / runs - 0.3) < 0.07


def test_no_jump_back_action() -> None:
    """(|0⟩ + |1⟩)/√2 and no loss observed: the |1⟩ weight becomes (1−p)/(2−p)."""
    p = 0.5
    seen = 0
    for seed in range(40):
        r = single_crossing_loss(p, (InputTerm("0", 1), InputTerm("1", 1)), seed)
        if any(e["kind"] == "noise" for _, e in r.trajectory.events()):
            continue
        seen += 1
        weights = {r.variant.readout(b).address: abs(b.amp) ** 2 for b in r.final}
        assert weights["1"] == pytest.approx((1 - p) / (2 - p), abs=1e-12)
        assert abs(r.metrics["norm"] - 1) < 1e-12
    assert seen > 5


def test_seeded_reproducibility() -> None:
    noise = ({"model": "depolarizing", "p": 0.05, "where": ["gate", "propagation"]},)
    a = simulate(cfg(n=2, m=2, noise=noise, seed=7, frames=True)).trajectory
    b = simulate(cfg(n=2, m=2, noise=noise, seed=7, frames=True)).trajectory
    assert a.frames == b.frames


# -- classical error models --------------------------------------------------------------

MEM_DIFF = ((0, 0), (0, 1), (1, 0), (1, 1))


def test_memory_bit_flip_all() -> None:
    noise = ({"model": "memory_bit_flip", "p": 1.0},)
    r = simulate(cfg(n=2, m=2, terms=(InputTerm("10", 1),), memory=MEM_DIFF, noise=noise))
    assert r.metrics["success"] == 1.0
    assert r.metrics["consistency"] == 0.0
    flips = r.trajectory.meta["noise"]["memory_flips"]
    assert len(flips) == 8


def test_copy_error_all() -> None:
    noise = ({"model": "copy_error", "p": 1.0},)
    for variant in ("basic", "backup"):
        r = simulate(
            cfg(variant, n=2, m=2, terms=(InputTerm("01", 1),), memory=MEM_DIFF, noise=noise)
        )
        assert r.metrics["success"] == 1.0
        assert r.metrics["consistency"] == 0.0
        assert r.trajectory.final["readout"][0]["data"] == "10"  # b⁽⁰¹⁾ = 01 read inverted


def test_gate_failure_all() -> None:
    """No gate ever acts: the train goes to cell 00 and back; the address is untouched."""
    noise = ({"model": "gate_failure", "p": 1.0, "where": ["gate"]},)
    r = simulate(cfg(n=2, m=2, terms=(InputTerm("11", 1),), memory=MEM_DIFF, noise=noise))
    (ro,) = r.trajectory.final["readout"]
    assert (ro["address"], ro["data"], ro["well_formed"]) == ("11", "00", True)
    assert r.metrics["consistency"] == 0.0


def test_clock_jitter() -> None:
    noise = ({"model": "clock_jitter", "p_early": 0.0, "p_late": 1.0},)
    r = simulate(cfg(n=2, m=1, terms=(InputTerm("11", 1),), noise=noise, frames=True))
    assert r.metrics["fidelity"] < 1
    shifted = r.trajectory.meta["noise"]["jitter"]
    assert shifted and all(j["shift"] == 1 for j in shifted)


# -- strays (D21) and collisions (D26) ---------------------------------------------------


def stray_scenario(seed: int = 0) -> Any:
    """n = 1: D₁ misrouted at its routing crossing; the copy in D₀'s lane meets an empty
    site and creates a stray in D₁'s time bin; on the way back stray and D₁ meet."""
    noise = ({"model": "scatter_flip", "p": 1.0, "targets": ["D_1"], "phases": ["routing"]},)
    return simulate(
        cfg(n=1, m=1, terms=(InputTerm("1", 1),), memory=((0,), (0,)), noise=noise, frames=True)
    )


def test_stray_created_and_collision() -> None:
    r = stray_scenario()
    kinds = [e["kind"] for _, e in r.trajectory.events()]
    assert "stray" in kinds and "collision" in kinds
    assert kinds.index("stray") < kinds.index("collision")
    (br,) = list(r.final)
    assert br.collided
    assert r.metrics["collided"] == pytest.approx(1.0)
    assert r.metrics["success"] == 0.0 and r.metrics["fidelity"] == 0.0
    # the stray is recorded in the trajectory and the frozen branch is flagged
    frame_q = r.trajectory.frames[r.schedule.T_fwd + 1]
    assert frame_q.branches[0].strays
    assert r.trajectory.frames[-1].branches[0].collided


def test_noisy_json_round_trip() -> None:
    traj = stray_scenario().trajectory
    text = traj.to_json()
    back = Trajectory.from_json(text)
    assert back == traj
    import json

    assert validate(json.loads(text)) == []
    texts = [e["text"] for _, e in traj.events() if e["kind"] in ("noise", "stray", "collision")]
    assert texts and all(t for t in texts)


def test_loss_event_narration_and_ghost() -> None:
    noise = (
        {
            "model": "loss",
            "p": 1.0,
            "where": ["scattering"],
            "targets": ["D_1"],
            "phases": ["routing"],
        },
    )
    r = simulate(cfg(n=1, m=1, terms=(InputTerm("1", 1),), noise=noise, frames=True))
    events = [(t, e) for t, e in r.trajectory.events() if e["kind"] == "noise"]
    assert events and "lost" in events[0][1]["text"] and "D₁" in events[0][1]["text"]
    t = events[0][0]
    after = r.trajectory.frames[t + 1].branches[0].walkers[2]  # D_1
    assert after.s == "E" and after.ghost is not None


def test_strict_is_disabled_with_noise() -> None:
    noise = ({"model": "bit_flip", "p": 0.5, "where": ["gate"]},)
    c = replace(cfg(n=2, m=1, noise=noise, seed=3), options=Options(strict=True))
    r = simulate(c)  # does not raise
    assert any("strict" in w for w in r.trajectory.meta["warnings"])


def test_noise_presets() -> None:
    from qramsim.presets import get_preset

    loss = simulate(get_preset("noise-loss").config)
    assert (loss.metrics["success"], loss.metrics["fidelity"]) == (1.0, 0.0)
    assert loss.trajectory.final["readout"][0]["data"] == "0"
    scatter = simulate(get_preset("noise-scatter").config)
    assert scatter.metrics["collided"] == 1.0
    stray = simulate(get_preset("noise-stray").config)
    kinds = [e["kind"] for _, e in stray.trajectory.events()]
    assert "stray" in kinds and "collision" in kinds
