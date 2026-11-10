"""Qudit and dual-rail variants (PLAN.md Phase 4, PROTOCOL.md §3.9–3.10, §5.3–5.4).

Gate tables against the technical paper (with the dual-rail orientation of the long-range
qudit Ŝ, DECISION D32, and the dual-rail modelling of D33); Eq. (1) exactly for the four
variants and every copy mode; routing followed by inverse routing is the identity; the train of
``dualrail_backup`` (two backups per carrier sharing a path coordinate); resources.
"""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest

from qramsim import InputTerm, Options, RecordOptions, RunConfig, simulate
from qramsim.alphabet import DualRail, Qudit
from qramsim.config import ConfigError, fill_memory
from qramsim.gates import GateKind, Port
from qramsim.geometry import PORT_LEVEL, all_addresses
from qramsim.rules import (
    DR_OUT_S,
    DR_OUT_SDAG,
    DR_X,
    DR_XC_OUT,
    QUDIT_XC,
    QUDIT_XC0,
    QUDIT_XC1,
    QUDIT_XL,
    rules_for,
)
from qramsim.simulator import Simulator

from helpers import random_superposition

DR, Q = DualRail, Qudit  # short names for the gate tables

TOL = 1e-12
NEW = ["qudit_short", "qudit_long", "dualrail_basic", "dualrail_backup"]
MODES = {
    "qudit_short": ["global", "cell_switch"],
    "qudit_long": ["global", "cell_switch"],
    "dualrail_basic": ["global", "cell_switch"],
    "dualrail_backup": ["backup"],
}
CASES = [(v, mode) for v in NEW for mode in MODES[v]]


def cfg(
    variant: str,
    n: int,
    m: int,
    terms: tuple[InputTerm, ...],
    mode: str,
    *,
    memory_seed: int = 0,
    query: bool = True,
    stagger: bool = True,
    frames: bool = False,
    **options: object,
) -> RunConfig:
    return RunConfig(
        variant=variant,
        n=n,
        m=m,
        copy_mode=mode,
        terms=terms,
        memory=fill_memory(n, m, "random", memory_seed),
        options=Options(strict=True, query=query, query_stagger=stagger, **options),  # type: ignore[arg-type]
        record=RecordOptions(frames=frames),
    )


def check_output(c: RunConfig):  # type: ignore[no-untyped-def]
    result = simulate(c)
    v = result.variant
    assert result.metrics["fidelity"] >= 1 - TOL
    assert abs(result.metrics["norm"] - 1) < TOL
    assert result.metrics["success"] >= 1 - TOL
    assert result.metrics["consistency"] >= 1 - TOL
    assert len(result.final) == len(result.config.terms)
    for br in result.final:
        assert all(br.present)  # qudit and dual-rail walkers are always present
        for k, w in enumerate(br.slots):
            assert (w.level, w.site, w.dir) == (PORT_LEVEL, -v.offset(k), -1)
            assert v.rules.colour(w.s) == 1  # red
        r = v.readout(br)
        assert r.well_formed
        assert r.data == v.stored(r.address)
    return result


# -- tables -------------------------------------------------------------------------------


def test_qudit_single_walker_tables() -> None:
    assert {Q.oR: Q.oB, Q.oB: Q.oR, Q.fR: Q.fB, Q.fB: Q.fR} == QUDIT_XC
    assert {Q.oR: Q.oB, Q.oB: Q.oR, Q.fR: Q.fR, Q.fB: Q.fB} == QUDIT_XC0
    assert {Q.oR: Q.oR, Q.oB: Q.oB, Q.fR: Q.fB, Q.fB: Q.fR} == QUDIT_XC1
    assert {Q.oR: Q.fR, Q.fR: Q.oR, Q.oB: Q.fB, Q.fB: Q.oB} == QUDIT_XL
    for s in Q:  # X^C = X^{C,0} X^{C,1}
        assert QUDIT_XC[s] == QUDIT_XC0[QUDIT_XC1[s]]


def test_qudit_long_scattering_is_the_dual_rail_orientation() -> None:
    """DECISION D32: ○R → right, ○B → left, ●R → left, ●B → right, colour reset to R."""
    r = rules_for("qudit_long")
    assert r.scatter_fwd(Q.oR) == (Q.oR, Port.RIGHT)
    assert r.scatter_fwd(Q.oB) == (Q.oR, Port.LEFT)
    assert r.scatter_fwd(Q.fR) == (Q.fR, Port.LEFT)
    assert r.scatter_fwd(Q.fB) == (Q.fR, Port.RIGHT)
    # Ŝ† inverts Ŝ on the ideal (parent-port) inputs
    for s in Q:
        out, port = r.scatter_fwd(s)
        assert r.scatter_bwd(out, port) == (s, Port.PARENT)


def test_qudit_short_scattering_reads_the_colour_only() -> None:
    r = rules_for("qudit_short")
    assert r.scatter_fwd(Q.oR) == (Q.oR, Port.LEFT)
    assert r.scatter_fwd(Q.fR) == (Q.fR, Port.LEFT)
    assert r.scatter_fwd(Q.oB) == (Q.oR, Port.RIGHT)
    assert r.scatter_fwd(Q.fB) == (Q.fR, Port.RIGHT)


def test_qudit_gate_activation() -> None:
    long, short = rules_for("qudit_long"), rules_for("qudit_short")
    assert long.target_table(GateKind.U, Q.oR, None) == QUDIT_XC0
    assert long.target_table(GateKind.U, Q.fR, None) == QUDIT_XC1
    assert [s for s in Q if long.active(GateKind.U, s)] == [Q.oR, Q.fR]
    assert [s for s in Q if short.active(GateKind.U_IN, s)] == [Q.fR, Q.fB]
    assert [s for s in Q if short.active(GateKind.U_B, s)] == [Q.oB, Q.fB]
    assert short.target_table(GateKind.U_B, Q.fB, None) == QUDIT_XC
    for r in (long, short):
        assert [s for s in Q if r.active(GateKind.COPY_GLOBAL, s)] == [Q.fR]
        assert r.target_table(GateKind.COPY_GLOBAL, Q.fR, 0) == QUDIT_XL  # M_j = ○R
        assert r.target_table(GateKind.COPY_GLOBAL, Q.fR, 1) == {s: s for s in Q}


def test_dual_rail_scattering() -> None:
    """Eqs. ScattRail1/0: Ŝ⁽↓⁾ = Ŝ, Ŝ⁽↑⁾ = Ŝ X̂ (rail kept)."""
    r = rules_for("dualrail_basic")
    assert r.scatter_fwd(DR.dR) == (DR.dR, Port.LEFT)
    assert r.scatter_fwd(DR.dB) == (DR.dR, Port.RIGHT)
    assert r.scatter_fwd(DR.uR) == (DR.uR, Port.RIGHT)
    assert r.scatter_fwd(DR.uB) == (DR.uR, Port.LEFT)
    assert [r.tree(s) for s in (DR.uR, DR.uB, DR.dR, DR.dB)] == [0, 0, 1, 1]
    # (Ŝ X̂)† = X̂ Ŝ†: a red walker back on ↑ from the left child becomes blue
    assert r.scatter_bwd(DR.uR, Port.LEFT) == (DR.uB, Port.PARENT)
    assert r.scatter_bwd(DR.uR, Port.RIGHT) == (DR.uR, Port.PARENT)


def test_dual_rail_gate_tables() -> None:
    r = rules_for("dualrail_basic")
    assert [s for s in (DR.uR, DR.uB, DR.dR, DR.dB) if r.active(GateKind.U, s)] == [DR.uR, DR.dR]
    assert r.target_table(GateKind.U, DR.uR, None) == DR_X
    assert [s for s in DR if r.active(GateKind.COPY_GLOBAL, s)] == [DR.dR]
    assert r.target_table(GateKind.COPY_GLOBAL, DR.dR, 0) == DR_X  # M_j = R (bit 0)
    assert r.target_table(GateKind.COPY_GLOBAL, DR.dR, 1) == {s: s for s in DR}
    b = rules_for("dualrail_backup")
    assert [s for s in DR if b.active(GateKind.U_B, s)] == [DR.uB, DR.dB, DR.xB]
    assert [s for s in DR if b.active(GateKind.COPY_BACKUP, s)] == [DR.dR]


def test_dual_rail_output_circuit() -> None:
    """D33: Ŝ_M (↓,B) → (aux,R); Ŝ_M† (aux,R) → (↑,B); X̂_c (↑,B) → (↑,R); permutations."""
    assert DR_OUT_S[DR.dR] == DR.dR and DR_OUT_S[DR.dB] == DR.xR
    assert DR_OUT_SDAG[DR.uR] == DR.uR and DR_OUT_SDAG[DR.xR] == DR.uB
    assert DR_XC_OUT[DR.uB] == DR.uR and DR_XC_OUT[DR.dR] == DR.dR
    for table in (DR_OUT_S, DR_OUT_SDAG, DR_XC_OUT, DR_X):
        assert sorted(table) == sorted(DR) and sorted(table.values()) == sorted(DR)
    net = {s: DR_XC_OUT[DR_OUT_SDAG[DR_OUT_S[s]]] for s in (DR.dR, DR.dB)}
    assert net == {DR.dR: DR.dR, DR.dB: DR.uR}  # bit 1 stays on ↓, bit 0 moves to ↑


# -- trains and schedules -------------------------------------------------------------------


@pytest.mark.parametrize("last", [True, False])
def test_dualrail_backup_train(last: bool) -> None:
    n, m = 2, 2
    c = cfg("dualrail_backup", n, m, (InputTerm("10", 1),), "backup", include_last_backup=last)
    v = Simulator(c).variant
    names = [s.name for s in v.slots]
    expected = ["A_1", "At_1u", "At_1d", "A_2", "At_2u", "At_2d", "D_1", "Dt_1u", "Dt_1d", "D_2"]
    expected += ["Dt_2u", "Dt_2d"] if last else []
    assert names == expected
    assert (3 * (n + m) if last else 3 * (n + m) - 2) == v.K
    offsets = [v.offset(k) for k in range(v.K)]
    assert offsets[:9] == [0, 1, 1, 2, 3, 3, 4, 5, 5]
    assert v.span == (2 * (n + m) if last else 2 * (n + m) - 1)
    assert v.geometry.sites(1) == 4
    enc = v.encode("10")
    assert enc[0] == DR.dR and enc[3] == DR.uR  # A_1 = 1 on ↓, A_2 = 0 on ↑
    assert enc[1] == DR.uR and enc[2] == DR.dR  # backups on their rails


def test_qudit_short_schedule() -> None:
    n, m = 3, 2
    v = Simulator(cfg("qudit_short", n, m, (InputTerm("101", 1),), "global")).variant
    sched = v.schedule()
    fwd = sched.forward
    assert [v.geometry.sites(d) for d in range(1, n + 1)] == [2, 2, 2]
    K = v.K  # A_1..A_3, D_0, D_1, D_2
    for d in range(1, n + 1):
        uin = [g for g in fwd if g.kind is GateKind.U_IN and g.level == d]
        ub = [g for g in fwd if g.kind is GateKind.U_B and g.level == d]
        assert len(uin) == 1 and uin[0].window == (2, 1)
        assert uin[0].control_slot == d - 1 and uin[0].target_slots == (d,)
        assert len(ub) == K - d - 1  # controls A_{d+1} … the slot before the tail
        assert [g.tick for g in ub] == [uin[0].tick + 1 + i for i in range(K - d - 1)]


def test_output_encodings() -> None:
    """Ideal outputs in the paper's encodings: qudit 0 → ○R, 1 → ●R; dual-rail 0 → ↑, 1 → ↓."""
    memory = ((0, 1), (1, 0), (1, 1), (0, 0))
    for variant, zero, one in (("qudit_short", Q.oR, Q.fR), ("dualrail_basic", DR.uR, DR.dR)):
        c = replace(cfg(variant, 2, 2, (InputTerm("01", 1),), "global"), memory=memory)
        r = check_output(c)
        (br,) = r.final
        names = [s.name for s in r.variant.slots]
        state = dict(zip(names, (w.s for w in br.slots), strict=True))
        assert (state["A_1"], state["A_2"]) == (zero, one)
        assert (state["D_1"], state["D_2"]) == (one, zero)  # b^(01) = 10
        assert state["D_0"] == one


# -- Eq. (1) --------------------------------------------------------------------------------


@pytest.mark.parametrize(("variant", "mode"), CASES)
@pytest.mark.parametrize("m", [1, 2])
@pytest.mark.parametrize("n", [1, 2, 3])
def test_classical_addresses(variant: str, mode: str, n: int, m: int) -> None:
    for memory_seed in range(2):
        for address in all_addresses(n):
            check_output(
                cfg(variant, n, m, (InputTerm(address, 1 + 0j),), mode, memory_seed=memory_seed)
            )


@pytest.mark.parametrize(("variant", "mode"), CASES)
@pytest.mark.parametrize("n", [1, 2, 3, 4])
def test_random_superpositions(variant: str, mode: str, n: int) -> None:
    rng = np.random.default_rng(97 * n + NEW.index(variant))
    for i in range(12 if n < 4 else 4):
        m = int(rng.integers(1, 3))
        terms = random_superposition(n, rng)
        result = check_output(cfg(variant, n, m, terms, mode, memory_seed=i))
        amps = {t.address: t.amp for t in result.config.terms}
        for br in result.final:  # permutation dynamics: amplitudes carried exactly
            assert br.amp == amps[result.variant.readout(br).address]


@pytest.mark.parametrize(("variant", "mode"), CASES)
def test_unstaggered_query(variant: str, mode: str) -> None:
    rng = np.random.default_rng(11)
    for i in range(4):
        check_output(
            cfg(variant, 3, 2, random_superposition(3, rng), mode, memory_seed=i, stagger=False)
        )


@pytest.mark.parametrize("last", [True, False])
def test_dualrail_backup_without_last_backups(last: bool) -> None:
    rng = np.random.default_rng(3)
    for i in range(4):
        terms = random_superposition(3, rng)
        check_output(
            cfg("dualrail_backup", 3, 2, terms, "backup", memory_seed=i, include_last_backup=last)
        )


@pytest.mark.parametrize(("variant", "mode"), CASES)
def test_no_query_is_identity(variant: str, mode: str) -> None:
    rng = np.random.default_rng(5)
    for n in (1, 2, 3):
        terms = random_superposition(n, rng)
        sim = Simulator(cfg(variant, n, 2, terms, mode, query=False))
        initial = sim.variant.initial_state(sim.terms)
        final = sim.run().with_directions(+1)
        assert len(final) == len(initial)
        for br in final:
            other = initial.get(br.key())
            assert other is not None and other.amp == br.amp and other.bid == br.bid


@pytest.mark.parametrize("variant", NEW)
def test_trajectory_roundtrip(variant: str) -> None:
    from qramsim.trajectory import Trajectory, validate

    mode = MODES[variant][0]
    terms = (InputTerm("01", 1), InputTerm("10", 1j))
    traj = simulate(cfg(variant, 2, 1, terms, mode, frames=True)).trajectory
    text = traj.to_json()
    assert Trajectory.from_json(text) == traj
    import json

    data = json.loads(text)
    assert validate(data) == []
    assert data["meta"]["family"] in ("qudit", "dualrail")
    assert data["meta"]["geometry"]["trees"] == (2 if variant.startswith("dualrail") else 1)
    kinds = {e["type"] for f in traj.frames for e in f.events if e["kind"] == "gate"}
    if variant.startswith("dualrail"):
        assert {"S_M", "S_M_dag", "X_c"} <= kinds
    texts = [e["text"] for f in traj.frames for e in f.events]
    assert all(isinstance(t, str) and t for t in texts)


# -- resources and configuration -------------------------------------------------------------


@pytest.mark.parametrize(
    ("variant", "mode", "walkers", "gates"),
    [
        ("qudit_short", "global", lambda n, m: n + m + 1, lambda n: 3 * (2**n - 1)),
        ("qudit_long", "global", lambda n, m: n + m + 1, lambda n: 2 * (2**n - 1)),
        ("dualrail_basic", "global", lambda n, m: n + m + 1, lambda n: 4 * (2**n - 1)),
        ("dualrail_backup", "backup", lambda n, m: 3 * (n + m), lambda n: 6 * (2**n - 1)),
    ],
)
def test_resources(variant: str, mode: str, walkers, gates) -> None:  # type: ignore[no-untyped-def]
    n, m = 3, 2
    r = simulate(cfg(variant, n, m, (InputTerm("110", 1),), mode))
    res = r.resources
    assert res["walkers_input"]["max"] == walkers(n, m)
    assert res["paper"]["gates"] == gates(n)
    assert res["paper"]["walkers_max"] == walkers(n, m)


def test_copy_modes_validated() -> None:
    with pytest.raises(ConfigError):
        simulate(cfg("dualrail_backup", 2, 1, (InputTerm("01", 1),), "global"))
    with pytest.raises(ConfigError):
        simulate(cfg("qudit_short", 2, 1, (InputTerm("01", 1),), "backup"))


# -- paper checkpoints (D18) for the new variants --------------------------------------------


def _checkpoint(preset: str, name: str) -> dict[str, str]:
    from qramsim.presets import get_preset

    traj = simulate(get_preset(preset).config).trajectory
    labels = [s["name"] for s in traj.meta["slots"]]
    (cp,) = [c for c in traj.final["checkpoints"] if c["name"] == name]
    (br,) = cp["branches"]
    return {labels[w["k"]]: w["s"] for w in br["walkers"]}


def test_qudit_short_level_one_checkpoint() -> None:
    """a = 10: A₁ = ●R makes Û_in turn A₂ blue; the Û_B chain carries blue to D₀, D₁."""
    after = _checkpoint("qudit-short", "ψ_1")
    assert after == {"A_1": "fR", "A_2": "oB", "D_0": "fB", "D_1": "fB"}


def test_dualrail_backup_level_one_checkpoint() -> None:
    """a = 10: A₁ on ↓ is red, so on the ↓ tree Û_in turns Ã₁↓ blue and Û_B passes the bit
    to every ↓ walker behind it; the ↑ tree has no control (A₁ is not there): all red."""
    after = _checkpoint("dualrail-backup", "ψ_1")
    down = {k: v for k, v in after.items() if v.startswith("d") and k != "A_1"}
    up = {k: v for k, v in after.items() if v.startswith("u")}
    assert after["A_1"] == "dR"
    assert down and all(v == "dB" for v in down.values())
    assert up and all(v == "uR" for v in up.values())
    assert after["A_2"] == "uR"  # a₂ = 0: on ↑, untouched at level 1


# -- depth scalings (technical paper, §Resource scalings) --------------------------------------


@pytest.mark.parametrize(
    ("variant", "expected"),
    [
        ("qudit_short", {"1": 2, "n": 6, "m": 3, "n²": 0, "n·m": 0}),  # paper 5n + 2m
        ("qudit_long", {"1": 2, "n": 5, "m": 3, "n²": 1, "n·m": 2}),  # paper n²/2 + nm + …
        ("dualrail_basic", {"1": 5, "n": 5, "m": 3, "n²": 1, "n·m": 2}),  # + output circuit
        ("dualrail_backup", {"1": 3, "n": 12, "m": 5, "n²": 0, "n·m": 0}),  # paper 13n + 7m
    ],
)
def test_measured_depth(variant: str, expected: dict[str, float]) -> None:
    from qramsim.scaling import fit, measure

    samples = measure(variant, range(2, 6), range(1, 4))
    assert all(s.fidelity > 1 - TOL for s in samples)
    f = fit(samples, "T_total")
    assert f["max_residual"] < 1e-9
    assert f["coefficients"] == pytest.approx(expected, abs=1e-9)
