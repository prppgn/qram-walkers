"""Coherent errors (PLAN.md Phase 3b, DESIGN.md §4.3, DECISION D30, pending P8).

Unitarity of the over-rotated X̂ and of the imbalanced Ŝ (forward, adjoint and reciprocal
backward crossings); ε = η = 0 reproduces the ideal run bitwise; analytic fidelities for
n = 1; pruning with the discarded weight reported; bounded trajectories.
"""

from __future__ import annotations

import json
import math
from dataclasses import replace
from typing import Any

import numpy as np
import pytest

from qramsim import InputTerm, Options, RecordOptions, RunConfig, simulate
from qramsim.config import ConfigError, input_terms
from qramsim.noise import imbalanced_scattering, overrotation_matrix, parse_noise
from qramsim.simulator import Simulator
from qramsim.trajectory import Trajectory, validate


def cfg(
    n: int = 1,
    m: int = 1,
    terms: tuple[InputTerm, ...] | None = None,
    noise: tuple[dict[str, Any], ...] = (),
    query: bool = True,
    frames: bool = False,
    **options: Any,
) -> RunConfig:
    return RunConfig(
        n=n,
        m=m,
        terms=terms if terms is not None else input_terms("uniform", n),
        memory_fill="ones",
        noise=noise,
        options=Options(query=query, **options),
        record=RecordOptions(frames=frames),
    )


@pytest.mark.parametrize("vacuum_phase", [True, False])
@pytest.mark.parametrize("eps", [0.0, 0.03, 0.5, 1.0, -0.2])
def test_overrotated_x_is_unitary(eps: float, vacuum_phase: bool) -> None:
    u = overrotation_matrix(eps * math.pi / 2, vacuum_phase)
    assert np.allclose(u.conj().T @ u, np.eye(3), atol=1e-14)
    if eps == 0:
        assert np.allclose(u, [[1, 0, 0], [0, 0, 1], [0, 1, 0]])  # basis (∅, R, B): X̂
    assert (abs(u[0, 0] - 1) < 1e-15) != vacuum_phase or eps == 0


@pytest.mark.parametrize("eta", [0.0, 0.05, 0.4, 1.0])
def test_imbalanced_scattering_is_unitary(eta: float) -> None:
    phi = eta * math.pi / 2
    fwd, adj, rec = (
        imbalanced_scattering(phi, mode) for mode in ("forward", "adjoint", "reciprocal")
    )
    for m in (fwd, adj, rec):
        assert np.allclose(m.conj().T @ m, np.eye(m.shape[0]), atol=1e-14)
    assert np.allclose(adj @ fwd, np.eye(fwd.shape[0]), atol=1e-14)  # adjoint undoes it
    assert np.allclose(rec, fwd.T, atol=1e-14)  # reciprocal device: transpose


def test_zero_errors_are_the_ideal_run_bitwise() -> None:
    noise = (
        {"model": "overrotation", "epsilon": 0.0, "sigma": 0.0},
        {"model": "beam_splitter_imbalance", "eta": 0.0},
    )
    base = cfg(n=2, m=1, frames=True)
    ideal = simulate(base).trajectory
    noisy = simulate(replace(base, noise=noise)).trajectory
    assert noisy.frames == ideal.frames
    assert noisy.final["state"] == ideal.final["state"]


@pytest.mark.parametrize("eps", [0.05, 0.1, 0.3])
def test_overrotation_analytic_fidelity(eps: float) -> None:
    """n = 1, a = 1: Û⁽¹⁾ hits D₀ and D₁ forward and again backward; between the two
    the path retraces exactly, so each target ends in X̂_ε²|R⟩ = cos(πε)|R⟩ − …|B⟩."""
    noise = ({"model": "overrotation", "epsilon": eps},)
    r = simulate(cfg(terms=(InputTerm("1", 1),), noise=noise, prune_eps=0.0))
    assert r.metrics["fidelity"] == pytest.approx(math.cos(math.pi * eps) ** 4, abs=1e-12)
    assert r.metrics["norm"] == pytest.approx(1.0, abs=1e-12)
    assert r.metrics["discarded"] == 0.0


@pytest.mark.parametrize("eta", [0.05, 0.2])
def test_beam_splitter_adjoint_cancels_and_reciprocal_does_not(eta: float) -> None:
    """n = 1, a = 0, no query: D₀, D₁ are mixed at node (1,1) and come back. With the
    adjoint backward crossing the mixing cancels exactly; with the reciprocal one each
    walker exits correctly with amplitude cos(πη)."""
    terms = (InputTerm("0", 1),)
    adj = simulate(
        cfg(
            terms=terms,
            query=False,
            noise=({"model": "beam_splitter_imbalance", "eta": eta, "backward": "adjoint"},),
        )
    )
    assert adj.metrics["fidelity"] == pytest.approx(1.0, abs=1e-12)
    rec = simulate(
        cfg(
            terms=terms,
            query=False,
            noise=({"model": "beam_splitter_imbalance", "eta": eta, "backward": "reciprocal"},),
        )
    )
    assert rec.metrics["fidelity"] == pytest.approx(math.cos(math.pi * eta) ** 4, abs=1e-12)


def test_vacuum_phase_option() -> None:
    """A superposition with an empty target in one branch: the vacuum phase changes the
    relative phase and hence the fidelity (D31: off by default)."""
    terms = (InputTerm("10", 1), InputTerm("11", 1))
    on = simulate(
        cfg(
            n=2,
            terms=terms,
            noise=({"model": "overrotation", "epsilon": 0.1, "vacuum_phase": True},),
        )
    )
    off = simulate(
        cfg(
            n=2,
            terms=terms,
            noise=({"model": "overrotation", "epsilon": 0.1, "vacuum_phase": False},),
        )
    )
    assert on.metrics["fidelity"] != pytest.approx(off.metrics["fidelity"], abs=1e-9)


def test_pruning_reports_discarded_weight() -> None:
    noise = ({"model": "overrotation", "epsilon": 0.2},)
    exact = simulate(cfg(n=2, m=1, noise=noise, prune_eps=0.0, max_branches=10**6))
    assert exact.metrics["discarded"] == 0.0
    assert exact.metrics["norm"] == pytest.approx(1.0, abs=1e-12)  # the evolution is unitary
    r = simulate(cfg(n=2, m=1, noise=noise, prune_eps=1e-4, frames=True))
    d = r.metrics["discarded"]
    assert d > 0 and r.metrics["norm"] < 1
    # pruning changes amplitudes by at most the dropped ones: |ΔF| ≲ 2√d
    assert abs(r.metrics["fidelity"] - exact.metrics["fidelity"]) <= 2 * d**0.5
    kinds = {(e["kind"], e.get("model")) for _, e in r.trajectory.events()}
    assert ("noise", "overrotation") in kinds and ("noise", "prune") in kinds


def test_branch_cap_and_frame_cap() -> None:
    noise = (
        {"model": "overrotation", "epsilon": 0.15},
        {"model": "beam_splitter_imbalance", "eta": 0.1},
    )
    c = cfg(n=3, m=2, noise=noise, max_branches=40, frames=True)
    c = replace(c, record=RecordOptions(frames=True, max_frame_branches=5))
    r = simulate(c)
    assert len(r.final) <= 40
    traj = r.trajectory
    assert all(len(f.branches) <= 5 for f in traj.frames)
    assert any(f.omitted for f in traj.frames)
    text = traj.to_json()
    assert Trajectory.from_json(text) == traj
    assert validate(json.loads(text)) == []
    labels = traj.meta["branch_labels"]
    assert all(isinstance(v, str) for v in labels.values())


def test_sigma_is_seeded() -> None:
    noise = ({"model": "overrotation", "epsilon": 0.05, "sigma": 0.03},)
    a = simulate(replace(cfg(n=2, noise=noise), seed=4))
    b = simulate(replace(cfg(n=2, noise=noise), seed=4))
    c = simulate(replace(cfg(n=2, noise=noise), seed=5))
    assert a.metrics == b.metrics
    assert a.metrics["fidelity"] != c.metrics["fidelity"]
    eps = a.trajectory.meta["noise"]["coherent"]
    assert eps and all("epsilon" in e for e in eps)


def test_parse_coherent_validation() -> None:
    v = Simulator(cfg()).variant
    with pytest.raises(ConfigError):
        parse_noise([{"model": "overrotation", "epsilon": 1.5}], v)
    with pytest.raises(ConfigError):
        parse_noise([{"model": "overrotation", "epsilon": 0.1, "sigma": -1}], v)
    with pytest.raises(ConfigError):
        parse_noise([{"model": "beam_splitter_imbalance", "eta": 0.1, "backward": "sideways"}], v)
    (ch,) = parse_noise([{"model": "overrotation", "epsilon": 0.1}], v)
    assert ch.active and ch.gates == frozenset({"U", "U_in", "U_B"})


@pytest.mark.parametrize("variant", ["basic", "backup"])
@pytest.mark.parametrize("backward", ["adjoint", "reciprocal"])
def test_evolution_is_unitary_and_pruning_accounted(variant: str, backward: str) -> None:
    """Without pruning the norm stays 1 (every step, including strays leaving at a cell,
    is injective); with pruning norm = 1 − discarded up to 2·prune_eps (D30)."""
    noise = (
        {"model": "overrotation", "epsilon": 0.08},
        {"model": "beam_splitter_imbalance", "eta": 0.06, "backward": backward},
    )
    base = RunConfig(
        variant=variant,
        n=2,
        m=1,
        copy_mode="backup" if variant == "backup" else "global",
        terms=(InputTerm("10", 1), InputTerm("01", 1j)),
        memory=((0,), (1,), (0,), (1,)),
        noise=noise,
        record=RecordOptions(frames=False),
    )
    exact = simulate(replace(base, options=Options(prune_eps=0.0, max_branches=10**6)))
    assert exact.metrics["norm"] == pytest.approx(1.0, abs=1e-12)
    for eps in (1e-12, 1e-8, 1e-5):
        r = simulate(replace(base, options=Options(prune_eps=eps, max_branches=10**6)))
        assert r.metrics["norm"] == pytest.approx(1 - r.metrics["discarded"], abs=2 * eps + 1e-12)
