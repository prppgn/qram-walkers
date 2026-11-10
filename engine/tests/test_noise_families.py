"""Noise on the qudit and dual-rail variants (PLAN.md Phase 4b, DECISION D35).

Channels on the new alphabets: completeness and definitions. Loss is heralded: no back-action
without a jump, and every jump leaves a missing walker, so the fidelity given a well-formed
output is exactly 1 (not so in the bosonic variants, where a lost walker can read as a 0).
Copies do not create walkers, the auxiliary rail empties at the end of the query, passive
elements do not fail. Analytic fidelities for the coherent errors.
"""

from __future__ import annotations

import json
import math
from dataclasses import replace
from typing import Any

import numpy as np
import pytest

from qramsim import InputTerm, Options, RecordOptions, RunConfig, simulate
from qramsim.alphabet import DualRail, Family, Qudit
from qramsim.config import ConfigError, input_terms
from qramsim.noise import (
    MODELS,
    NO_WALKER,
    STOCHASTIC,
    apply_channel,
    kraus_matrix,
    kraus_ops,
    parse_noise,
)
from qramsim.presets import get_preset
from qramsim.simulator import Simulator
from qramsim.sweeps import run_ensemble, sweep
from qramsim.trajectory import Trajectory, validate

DR, Q = DualRail, Qudit  # short names, as in the gate tables
NEW = ["qudit_short", "qudit_long", "dualrail_basic", "dualrail_backup"]
FAMILIES = [Family.QUDIT, Family.DUALRAIL]
FOR_FAMILIES = sorted(STOCHASTIC - {"presence_dephasing"})


def cfg(
    variant: str,
    n: int = 2,
    m: int = 1,
    terms: tuple[InputTerm, ...] | None = None,
    noise: tuple[dict[str, Any], ...] = (),
    seed: int = 0,
    frames: bool = False,
    memory: tuple[tuple[int, ...], ...] | None = None,
    **options: Any,
) -> RunConfig:
    return RunConfig(
        variant=variant,
        n=n,
        m=m,
        copy_mode="backup" if "backup" in variant else "global",
        terms=terms if terms is not None else input_terms("uniform", n),
        memory=memory,
        memory_fill="random",
        memory_seed=1,
        noise=noise,
        seed=seed,
        options=Options(**options),
        record=RecordOptions(frames=frames),
    )


# -- channels -------------------------------------------------------------------------------


@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("model", FOR_FAMILIES)
@pytest.mark.parametrize("p", [0.0, 0.01, 0.3, 1.0])
def test_kraus_completeness(family: Family, model: str, p: float) -> None:
    ops = kraus_ops(model, p, family)
    total = sum(kraus_matrix(k, family).conj().T @ kraus_matrix(k, family) for k in ops)
    assert np.allclose(total, np.eye(total.shape[0]), atol=1e-14)


@pytest.mark.parametrize("family", FAMILIES)
@pytest.mark.parametrize("on", ["colour", "logical", "both"])
@pytest.mark.parametrize("p", [0.0, 0.1, 1.0])
def test_depolarizing_completeness(family: Family, on: str, p: float) -> None:
    ops = kraus_ops("depolarizing", p, family, on)
    assert len(ops) == (16 if on == "both" else 4)
    total = sum(kraus_matrix(k, family).conj().T @ kraus_matrix(k, family) for k in ops)
    assert np.allclose(total, np.eye(total.shape[0]), atol=1e-14)


def test_loss_on_the_new_alphabets() -> None:
    q, s = math.sqrt(0.9), math.sqrt(0.1)
    ops = kraus_ops("loss", 0.1, Family.QUDIT)
    assert len(ops) == 5  # no-jump, then one jump per local state
    assert ops[0] == {
        NO_WALKER: (NO_WALKER, 1),
        Q.oR: (Q.oR, q),
        Q.oB: (Q.oB, q),
        Q.fR: (Q.fR, q),
        Q.fB: (Q.fB, q),
    }
    assert ops[1] == {Q.oR: (NO_WALKER, s)}
    assert ops[4] == {Q.fB: (NO_WALKER, s)}
    # dual-rail: the four modes and the two of the auxiliary rail
    assert len(kraus_ops("loss", 0.1, Family.DUALRAIL)) == 7


def test_no_jump_operator_is_proportional_to_the_identity() -> None:
    """Hence no back-action on a superposition of logical values (D35)."""
    for family in FAMILIES:
        k0 = kraus_matrix(kraus_ops("loss", 0.2, family)[0], family)
        assert np.allclose(k0[1:, 1:], math.sqrt(0.8) * np.eye(k0.shape[0] - 1))
        assert k0[0, 0] == 1  # the empty slot


def test_colour_channels_keep_the_logical_value() -> None:
    q = kraus_ops("bit_flip", 1.0, Family.QUDIT)[1]
    assert q[Q.oR][0] == Q.oB and q[Q.fB][0] == Q.fR
    d = kraus_ops("bit_flip", 1.0, Family.DUALRAIL)[1]
    assert d[DR.uR][0] == DR.uB and d[DR.dB][0] == DR.dR and d[DR.xR][0] == DR.xB
    z = kraus_ops("colour_dephasing", 1.0, Family.QUDIT)[1]
    assert z[Q.oR][1] == 1 and z[Q.oB][1] == -1 and z[Q.fR][1] == 1 and z[Q.fB][1] == -1


def test_logical_channels() -> None:
    fq = kraus_ops("logical_flip", 1.0, Family.QUDIT)[1]
    assert fq[Q.oR][0] == Q.fR and fq[Q.fB][0] == Q.oB and fq[NO_WALKER][0] == NO_WALKER
    fd = kraus_ops("logical_flip", 1.0, Family.DUALRAIL)[1]
    assert fd[DR.uR][0] == DR.dR and fd[DR.dB][0] == DR.uB
    assert fd[DR.xR][0] == DR.xR  # no logical value on the auxiliary rail
    zq = kraus_ops("logical_dephasing", 1.0, Family.QUDIT)[1]
    assert zq[Q.oR][1] == -1 and zq[Q.oB][1] == -1 and zq[Q.fR][1] == 1 and zq[NO_WALKER][1] == 1
    zd = kraus_ops("logical_dephasing", 1.0, Family.DUALRAIL)[1]
    assert zd[DR.uR][1] == -1 and zd[DR.dR][1] == 1 and zd[DR.xR][1] == 1


def test_logical_dephasing_is_presence_dephasing_on_bosonic_variants() -> None:
    assert kraus_ops("logical_dephasing", 0.2) == kraus_ops("presence_dephasing", 0.2)


def test_parse_validation() -> None:
    new = Simulator(cfg("qudit_long")).variant
    old = Simulator(cfg("basic")).variant
    with pytest.raises(ConfigError, match="logical_dephasing"):
        parse_noise([{"model": "presence_dephasing", "p": 0.1}], new)
    with pytest.raises(ConfigError, match="logical_flip"):
        parse_noise([{"model": "logical_flip", "p": 0.1}], old)
    with pytest.raises(ConfigError, match="on"):
        parse_noise([{"model": "depolarizing", "p": 0.1, "on": "logical"}], old)
    with pytest.raises(ConfigError, match="on"):
        parse_noise([{"model": "depolarizing", "p": 0.1, "on": "sideways"}], new)
    with pytest.raises(ConfigError, match="on"):
        parse_noise([{"model": "bit_flip", "p": 0.1, "on": "logical"}], new)
    with pytest.raises(ConfigError, match="vacuum_phase"):
        parse_noise([{"model": "overrotation", "epsilon": 0.1, "vacuum_phase": True}], new)
    assert parse_noise([{"model": "logical_dephasing", "p": 0.1}], old)[0].active
    (ch,) = parse_noise([{"model": "depolarizing", "p": 0.1, "on": "both"}], new)
    assert len(ch.kraus) == 16


def test_logical_flip_moves_a_dual_rail_walker_to_the_other_tree() -> None:
    sim = Simulator(cfg("dualrail_basic", terms=(InputTerm("10", 1),)))
    v = sim.variant
    (ch,) = parse_noise([{"model": "logical_flip", "p": 1.0}], v)
    k = next(s.index for s in v.slots if s.name == "D_1")
    state = v.initial_state(sim.terms)
    before = next(iter(state)).slots[k]
    assert before.s == DR.dR
    out, jump = apply_channel(state, ch, k, lambda _: True, np.random.default_rng(0))
    after = next(iter(out)).slots[k]
    assert jump is not None
    assert after.s == DR.uR
    assert (after.level, after.branch, after.site) == (before.level, before.branch, before.site)


# -- whole runs --------------------------------------------------------------------------------


@pytest.mark.parametrize("variant", NEW)
def test_p_zero_is_the_ideal_run_bitwise(variant: str) -> None:
    base = cfg(variant, frames=True)
    ideal = simulate(base).trajectory
    noisy_models = [m for m in MODELS if m != "presence_dephasing"]
    noise: list[dict[str, Any]] = []
    for model in noisy_models:
        key = {"clock_jitter": "p_early", "overrotation": "epsilon"}.get(
            model, "eta" if model == "beam_splitter_imbalance" else "p"
        )
        noise.append({"model": model, key: 0.0})
    noisy = simulate(replace(base, noise=tuple(noise))).trajectory
    assert noisy.frames == ideal.frames
    assert noisy.final["state"] == ideal.final["state"]


@pytest.mark.parametrize("variant", NEW)
def test_loss_one_loses_everything(variant: str) -> None:
    noise = ({"model": "loss", "p": 1.0},)
    r = simulate(cfg(variant, noise=noise))
    for br in r.final:
        assert not any(br.present)
    assert r.metrics["success"] == 0
    assert r.metrics["fidelity"] == 0


@pytest.mark.parametrize("variant", NEW)
def test_loss_is_heralded(variant: str) -> None:
    """No jump: the state is exact. A jump: the output misses a walker, F = 0, not well formed."""
    noise = ({"model": "loss", "p": 0.01},)
    seen = {True: 0, False: 0}
    for seed in range(40):
        r = simulate(cfg(variant, noise=noise, seed=seed))
        lost = sum(r.counters.noise_events.values()) > 0
        seen[lost] += 1
        if lost:
            assert r.metrics["success"] == 0
            assert r.metrics["fidelity"] == 0
        else:
            assert r.metrics["success"] == pytest.approx(1, abs=1e-12)
            assert r.metrics["fidelity"] == pytest.approx(1, abs=1e-12)
    assert seen[True] > 0 and seen[False] > 0


def test_bosonic_loss_is_not_heralded() -> None:
    """Without a jump the state skews (back-action), and a lost address or data walker can
    leave a well-formed output: the heralded fidelity stays below 1."""
    noise = ({"model": "loss", "p": 0.01},)
    no_jump = [
        r
        for r in (simulate(cfg("basic", noise=noise, seed=s)) for s in range(40))
        if sum(r.counters.noise_events.values()) == 0
    ]
    assert no_jump
    assert no_jump[0].metrics["fidelity"] < 1 - 1e-3
    ens = run_ensemble(cfg("basic", noise=noise), 200, workers=1)
    assert ens.mean["heralded_fidelity"] < 0.99
    for variant in NEW:
        new = run_ensemble(cfg(variant, noise=noise), 60, workers=1)
        assert new.mean["heralded_fidelity"] == pytest.approx(1, abs=1e-12)
        assert new.sem["heralded_fidelity"] == pytest.approx(0, abs=1e-12)
        assert new.mean["success"] < 1


def test_heralded_fidelity_in_ensembles_and_sweeps() -> None:
    noise = ({"model": "bit_flip", "p": 0.02, "where": ["gate"]},)
    ens = run_ensemble(cfg("qudit_short", noise=noise), 40, workers=1)
    assert ens.mean["heralded_fidelity"] == pytest.approx(
        ens.mean["fidelity"] / ens.mean["success"], abs=1e-12
    )
    assert ens.sem["heralded_fidelity"] >= 0
    data = ens.to_dict()
    assert "heralded_fidelity" in data["mean"]
    assert json.dumps(data)
    # nothing ever well formed: undefined, hence left out of the JSON answer
    dead = run_ensemble(cfg("qudit_long", noise=({"model": "loss", "p": 1.0},)), 4, workers=1)
    assert "heralded_fidelity" not in dead.to_dict()["mean"]
    configs = {v: cfg(v, noise=({"model": "loss", "p": 0.0},)) for v in ("basic", "dualrail_basic")}
    rows = sweep(configs, "p", [0.0, 0.01], 8, workers=1)
    assert {"heralded_fidelity", "heralded_fidelity_sem"} <= set(rows[0])
    assert all(r["heralded_fidelity"] == pytest.approx(1) for r in rows if r["value"] == 0)


@pytest.mark.parametrize("variant", ["qudit_short", "qudit_long", "dualrail_basic"])
def test_logical_dephasing_counts_flips(variant: str) -> None:
    """p = 1 on A₁ inside the tree: the 0 branch takes one sign per tick, so the fidelity of
    (|00⟩ + |10⟩)/√2 is 1 or 0 according to the parity of the number of ticks."""
    terms = (InputTerm("00", 1), InputTerm("10", 1))
    for phases in (["routing"], ["routing", "inverse"]):
        noise = (
            {
                "model": "logical_dephasing",
                "p": 1.0,
                "where": ["propagation"],
                "targets": ["A_1"],
                "phases": phases,
            },
        )
        r = simulate(cfg(variant, terms=terms, noise=noise, frames=True))
        k = next(s.index for s in r.variant.slots if s.name == "A_1")
        ticks = sum(
            1
            for f in r.trajectory.frames
            if f.phase in phases and f.branches[0].walkers[k].pos[0] >= 1  # type: ignore[index]
        )
        assert r.metrics["fidelity"] == pytest.approx(1.0 if ticks % 2 == 0 else 0.0, abs=1e-12)
        assert r.metrics["norm"] == pytest.approx(1, abs=1e-12)


def test_logical_dephasing_coincides() -> None:
    """Basic, long-range qudit and dual-rail have the same train and clock, and ∅, ○, ↑ take the
    sign alike: the same seed gives the same fidelity, run by run (the map of the technical
    paper)."""
    noise = ({"model": "logical_dephasing", "p": 0.02, "where": ["propagation"]},)
    memory = ((0,), (1,), (1,), (0,))
    for seed in range(6):
        values = [
            simulate(cfg(v, noise=noise, seed=seed, memory=memory)).metrics["fidelity"]
            for v in ("basic", "qudit_long", "dualrail_basic")
        ]
        assert values[1] == pytest.approx(values[0], abs=1e-12)
        assert values[2] == pytest.approx(values[0], abs=1e-12)


def test_logical_flip_of_a_twin_backup_collides() -> None:
    """The two backups of a carrier share a site on the two trees: a rail exchange puts them
    on one tree, which the single-occupancy rule catches (D26)."""
    noise = ({"model": "logical_flip", "p": 1.0, "where": ["propagation"], "targets": ["At_1u"]},)
    r = simulate(cfg("dualrail_backup", terms=(InputTerm("10", 1),), noise=noise))
    assert r.metrics["collided"] == pytest.approx(1)


@pytest.mark.parametrize("variant", NEW)
def test_copy_on_an_empty_site_does_nothing(variant: str) -> None:
    """D₁ lost on its first bifurcation, stored bits 0: no walker appears (D35, unlike D21)."""
    noise = (
        {
            "model": "loss",
            "p": 1.0,
            "where": ["scattering"],
            "targets": ["D_1"],
            "phases": ["routing"],
        },
    )
    memory = ((0,), (0,), (0,), (0,))
    r = simulate(cfg(variant, terms=(InputTerm("10", 1),), noise=noise, memory=memory, frames=True))
    kinds = {e["kind"] for _, e in r.trajectory.events()}
    assert "stray" not in kinds
    k = next(s.index for s in r.variant.slots if s.name == "D_1")
    (br,) = r.final
    assert not br.present[k]
    assert not br.strays
    assert r.metrics["success"] == 0
    (row,) = r.trajectory.final["readout"]
    assert not row["well_formed"]
    assert row["erased"] == ["D₁"]
    assert row["address"] == "10"


def test_walker_left_on_the_auxiliary_rail_leaves_at_the_cell() -> None:
    """Stored bit 1, D₁ flipped once per query tick: blue before Ŝ_M (→ aux), then blue on aux at
    Ŝ_M† (stays), so the query ends with it on the auxiliary rail (D35)."""
    noise = (
        {
            "model": "bit_flip",
            "p": 1.0,
            "where": ["idle"],
            "targets": ["D_1"],
            "phases": ["query"],
        },
    )
    r = simulate(
        cfg(
            "dualrail_basic",
            n=1,
            terms=(InputTerm("0", 1),),
            noise=noise,
            memory=((1,), (1,)),
            frames=True,
        )
    )
    absorbed = [e for _, e in r.trajectory.events() if e["kind"] == "absorb"]
    assert len(absorbed) == 1
    assert "auxiliary rail" in absorbed[0]["text"]
    k = next(s.index for s in r.variant.slots if s.name == "D_1")
    (br,) = r.final
    assert not br.present[k]
    assert r.metrics["success"] == 0


@pytest.mark.parametrize("variant", ["dualrail_basic", "dualrail_backup"])
def test_passive_elements_do_not_fail(variant: str) -> None:
    memory = ((0,), (0,), (0,), (0,))
    passive = ["S_M", "S_M_dag"]
    for entry in (
        {"model": "gate_failure", "p": 1.0, "gates": passive},
        {"model": "clock_jitter", "p_early": 1.0, "gates": passive},
        {"model": "bit_flip", "p": 1.0, "where": ["memory"], "gates": passive},
    ):
        r = simulate(cfg(variant, noise=(entry,), memory=memory))
        assert r.metrics["fidelity"] == pytest.approx(1, abs=1e-12), entry
    # the clocked X̂_c is active: without it a data walker that read 0 stays blue on ↑
    fail = ({"model": "gate_failure", "p": 1.0, "gates": ["X_c"]},)
    assert simulate(cfg(variant, noise=fail, memory=memory)).metrics["fidelity"] < 0.5


@pytest.mark.parametrize("variant", NEW)
def test_classical_memory_errors(variant: str) -> None:
    terms = (InputTerm("01", 1),)
    memory = ((1,), (1,), (1,), (1,))
    flip = simulate(
        cfg(
            variant,
            terms=terms,
            memory=memory,
            noise=({"model": "memory_bit_flip", "p": 1.0},),
        )
    )
    assert flip.metrics["consistency"] == 0  # data read 0, the intended memory says 1
    assert flip.metrics["success"] == pytest.approx(1, abs=1e-12)
    wrong = simulate(
        cfg(variant, terms=terms, memory=memory, noise=({"model": "copy_error", "p": 1.0},))
    )
    assert wrong.metrics["consistency"] == 0


# -- coherent errors ---------------------------------------------------------------------------


@pytest.mark.parametrize("variant", ["qudit_long", "dualrail_basic"])
@pytest.mark.parametrize("eps", [0.05, 0.2])
def test_overrotation_analytic(variant: str, eps: float) -> None:
    """n = 1: for a = 1 the gate flips D₀ and D₁ forward and backward (as in the basic
    variant): F = cos⁴(πε). For a = 0 the control acts on its own subspace or tree, where
    no follower is: nothing is flipped and F = 1."""
    noise = ({"model": "overrotation", "epsilon": eps},)
    one = simulate(
        cfg(
            variant,
            n=1,
            terms=(InputTerm("1", 1),),
            noise=noise,
            memory=((1,), (1,)),
            prune_eps=0.0,
        )
    )
    assert one.metrics["fidelity"] == pytest.approx(math.cos(math.pi * eps) ** 4, abs=1e-12)
    zero = simulate(
        cfg(
            variant,
            n=1,
            terms=(InputTerm("0", 1),),
            noise=noise,
            memory=((1,), (1,)),
            prune_eps=0.0,
        )
    )
    assert zero.metrics["fidelity"] == pytest.approx(1, abs=1e-12)


@pytest.mark.parametrize(
    ("variant", "walkers"),
    [("qudit_short", 3), ("qudit_long", 3), ("dualrail_basic", 3), ("dualrail_backup", 6)],
)
@pytest.mark.parametrize("eta", [0.05, 0.2])
def test_imbalance_analytic(variant: str, walkers: int, eta: float) -> None:
    """n = 1, a = 0, no query. Adjoint backward crossing: the mixing cancels. Reciprocal: each
    walker comes back correct with amplitude cos²φ − sin²φ = cos(πη)."""
    terms = (InputTerm("0", 1),)
    adj = {"model": "beam_splitter_imbalance", "eta": eta, "backward": "adjoint"}
    rec = {"model": "beam_splitter_imbalance", "eta": eta, "backward": "reciprocal"}
    a = simulate(cfg(variant, n=1, terms=terms, noise=(adj,), query=False, prune_eps=0.0))
    assert a.metrics["fidelity"] == pytest.approx(1, abs=1e-12)
    b = simulate(cfg(variant, n=1, terms=terms, noise=(rec,), query=False, prune_eps=0.0))
    assert b.metrics["fidelity"] == pytest.approx(
        math.cos(math.pi * eta) ** (2 * walkers), abs=1e-12
    )


@pytest.mark.parametrize("variant", NEW)
@pytest.mark.parametrize("backward", ["adjoint", "reciprocal"])
def test_coherent_evolution_is_unitary(variant: str, backward: str) -> None:
    """Every step is injective, walkers leaving at a cell included (their environment record
    keeps the state they took away). Twelve walkers would branch too much at n = 2."""
    noise = (
        {"model": "overrotation", "epsilon": 0.08},
        {"model": "beam_splitter_imbalance", "eta": 0.06, "backward": backward},
    )
    if variant == "dualrail_backup":
        terms = (InputTerm("1", 1), InputTerm("0", 1j))
        n, memory = 1, ((0,), (1,))
    else:
        terms = (InputTerm("10", 1), InputTerm("01", 1j))
        n, memory = 2, ((0,), (1,), (0,), (1,))
    base = cfg(
        variant, n=n, terms=terms, noise=noise, memory=memory, prune_eps=0.0, max_branches=10**6
    )
    r = simulate(base)
    assert r.metrics["norm"] == pytest.approx(1, abs=1e-12)
    assert r.metrics["discarded"] == 0


@pytest.mark.parametrize("variant", ["dualrail_basic", "dualrail_backup"])
def test_coherent_spread_is_independent_per_tree(variant: str) -> None:
    noise = (
        {"model": "overrotation", "epsilon": 0.05, "sigma": 0.02},
        {"model": "beam_splitter_imbalance", "eta": 0.05, "sigma": 0.02},
    )
    terms = (InputTerm("0", 1), InputTerm("1", 1))
    r = simulate(cfg(variant, n=1, terms=terms, noise=noise, frames=True, prune_eps=1e-4))
    samples = r.trajectory.meta["noise"]["coherent"]
    gates = [s for s in samples if s["model"] == "overrotation"]
    nodes = [s for s in samples if s["model"] == "beam_splitter_imbalance"]
    assert {s["tree"] for s in gates} == {0, 1}
    assert {s["tree"] for s in nodes} == {0, 1}
    assert len({s["eta"] for s in nodes}) == len(nodes)


# -- trajectories, narration, presets ------------------------------------------------------------


@pytest.mark.parametrize("variant", NEW)
def test_noisy_round_trip_and_narration(variant: str) -> None:
    noise = (
        {"model": "loss", "p": 0.05},
        {"model": "bit_flip", "p": 0.05},
        {"model": "colour_dephasing", "p": 0.05},
        {"model": "logical_dephasing", "p": 0.05},
        {"model": "logical_flip", "p": 0.02},
        {"model": "depolarizing", "p": 0.05, "on": "both"},
        {"model": "scatter_flip", "p": 0.02},
    )
    traj = simulate(cfg(variant, noise=noise, seed=3, frames=True)).trajectory
    text = traj.to_json()
    assert Trajectory.from_json(text) == traj
    assert validate(json.loads(text)) == []
    jumps = [e for _, e in traj.events() if e["kind"] == "noise"]
    assert jumps
    assert all(isinstance(e["text"], str) and e["text"].startswith("Noise (") for e in jumps)


def test_ghost_of_a_lost_walker_follows_its_train() -> None:
    """Rendering only: the ghost of a lost D₁ takes the path of the walkers around it."""
    noise = (
        {
            "model": "loss",
            "p": 1.0,
            "where": ["propagation"],
            "targets": ["D_1"],
            "phases": ["routing"],
        },
    )
    r = simulate(cfg("dualrail_basic", terms=(InputTerm("11", 1),), noise=noise, frames=True))
    k = next(s.index for s in r.variant.slots if s.name == "D_1")
    k0 = next(s.index for s in r.variant.slots if s.name == "D_0")
    t_fwd = r.trajectory.meta["phases"]["T_fwd"]
    frame = r.trajectory.frames[t_fwd]  # end of routing
    ghost = frame.branches[0].walkers[k].ghost
    assert ghost is not None
    assert ghost.pos[:2] == frame.branches[0].walkers[k0].pos[:2]


def test_noise_presets_of_the_new_variants() -> None:
    for name in ("noise-qudit", "noise-dualrail"):
        r = simulate(get_preset(name).config)
        assert r.trajectory.meta["noise"]["channels"]
        assert r.metrics["norm"] == pytest.approx(1, abs=1e-9)
