"""Backup variant (technical paper, §Backup variant; PROTOCOL.md §3.5–3.8, §4.2, §5.2,
§6 E3–E4).

Correctness gate: Eq. (1) for n ≤ 4, m ≤ 3, with and without the last data backup D̃_m,
every classical address with random memories and ≥ 50 random superpositions; exact time
reversal; the arXiv chain of Û_in and Û_B (E3); the pipelining bullets of the technical
paper, §Depth reduction (E4).
"""

from __future__ import annotations

import itertools
from dataclasses import replace

import numpy as np
import pytest

from qramsim import InputTerm, Options, RecordOptions, RunConfig, simulate
from qramsim.alphabet import BLUE, EMPTY, RED
from qramsim.config import fill_memory
from qramsim.gates import GateKind, controlled_window_table
from qramsim.geometry import PORT_LEVEL, all_addresses
from qramsim.kets import SnapshotRecorder, ket_branch, paper_checkpoints
from qramsim.presets import get_preset
from qramsim.schedule import Phase
from qramsim.simulator import Simulator

from helpers import random_superposition

TOL = 1e-12


def backup_config(
    n: int,
    m: int,
    terms: tuple[InputTerm, ...],
    *,
    last_backup: bool = True,
    memory_seed: int = 0,
    strict: bool = True,
    query: bool = True,
    stagger: bool = True,
    frames: bool = False,
) -> RunConfig:
    return RunConfig(
        variant="backup",
        n=n,
        m=m,
        copy_mode="backup",
        terms=terms,
        memory=fill_memory(n, m, "random", memory_seed),
        options=Options(
            strict=strict, query=query, query_stagger=stagger, include_last_backup=last_backup
        ),
        record=RecordOptions(frames=frames),
    )


def check_output(cfg: RunConfig) -> None:
    result = simulate(cfg)
    assert result.metrics["fidelity"] >= 1 - TOL
    assert abs(result.metrics["norm"] - 1) < TOL
    assert result.metrics["success"] >= 1 - TOL
    assert result.metrics["consistency"] >= 1 - TOL
    assert len(result.final) == len(result.config.terms)
    for br in result.final:
        for k, (w, present) in enumerate(zip(br.slots, br.present, strict=True)):
            assert (w.level, w.site, w.dir) == (PORT_LEVEL, -k, -1)
            if present:
                assert w.s == RED
        readout = result.variant.readout(br)
        assert readout.well_formed
        assert readout.data == result.variant.stored(readout.address)


# -- train, encoding, geometry ---------------------------------------------------------


@pytest.mark.parametrize("last_backup", [True, False])
def test_train_and_edges(last_backup: bool) -> None:
    sim = Simulator(backup_config(2, 2, (InputTerm("10", 1),), last_backup=last_backup))
    names = [s.name for s in sim.variant.slots]
    expected = ["A_1", "At_1", "A_2", "At_2", "D_1", "Dt_1", "D_2", "Dt_2"]
    if not last_backup:
        expected = expected[:-1]
    assert names == expected
    assert [s.label for s in sim.variant.slots][:2] == ["A₁", "Ã₁"]
    K = sim.variant.K
    assert (8 if last_backup else 7) == K
    assert sim.geometry.level_sites == (4, 4, K)  # technical paper, §Depth reduction: n_sites = 4
    assert sim.variant.encode("10") == (RED, RED, EMPTY, *([RED] * (K - 3)))
    # engine depth in the lane model: 2(4n + K) + T_q (DECISION D3)
    assert sim.schedule.T_fwd == 4 * 2 + K
    assert sim.schedule.T_total == 2 * (4 * 2 + K) + sim.schedule.T_q


def test_gate_tables() -> None:
    """Û_in: CNOT activated by red; Û_B: C-NOT-NOT activated by **blue**."""
    t_in = controlled_window_table(GateKind.U_IN, 1)
    t_b = controlled_window_table(GateKind.U_B, 2)
    for table in (t_in, t_b):
        assert sorted(table.values()) == sorted(table)  # permutation
        assert all(table[table[w]] == w for w in table)  # self-adjoint
    assert t_in[(RED, RED)] == (RED, BLUE)
    assert t_in[(EMPTY, RED)] == (EMPTY, RED)
    assert t_in[(BLUE, RED)] == (BLUE, RED)
    assert t_b[(BLUE, RED, RED)] == (BLUE, BLUE, BLUE)
    assert t_b[(BLUE, EMPTY, RED)] == (BLUE, EMPTY, BLUE)  # an empty slot stays empty
    assert t_b[(RED, RED, RED)] == (RED, RED, RED)
    assert t_b[(EMPTY, RED, RED)] == (EMPTY, RED, RED)
    t_copy = controlled_window_table(GateKind.COPY_BACKUP, 1, (0,))
    assert t_copy[(RED, RED)] == (RED, EMPTY)
    assert t_copy[(BLUE, RED)] == (BLUE, RED)


@pytest.mark.parametrize("last_backup", [True, False])
def test_forward_schedule(last_backup: bool) -> None:
    """PROTOCOL.md §4.2: Û_in on (3,2) at X(d,3)+k(A_d); Û_B on (4,3,2) at X(d,4)+k(W̃),
    n + m − d firings per level (D4), the first two ticks after Û_in."""
    n, m = 3, 2
    sim = Simulator(backup_config(n, m, (InputTerm("101", 1),), last_backup=last_backup))
    geo, slots = sim.geometry, sim.variant.slots
    fwd = sim.schedule.forward
    for d in range(1, n + 1):
        u_in = [g for g in fwd if g.kind is GateKind.U_IN and g.level == d]
        u_b = sorted(
            (g for g in fwd if g.kind is GateKind.U_B and g.level == d), key=lambda g: g.tick
        )
        assert len(u_in) == 1 and len(u_b) == n + m - d
        g = u_in[0]
        assert (g.control_site, g.target_sites) == (3, (2,))
        assert slots[g.control_slot].name == f"A_{d}" and g.tick == geo.X(d, 3) + 2 * (d - 1)
        assert u_b[0].tick == g.tick + 2
        controls = [slots[x.control_slot].name for x in u_b]
        assert controls == [f"At_{i}" for i in range(d, n + 1)] + [f"Dt_{j}" for j in range(1, m)]
        for x in u_b:
            assert (x.control_site, x.target_sites) == (4, (3, 2))
            assert x.tick == geo.X(d, 4) + x.control_slot
        assert [b.tick - a.tick for a, b in itertools.pairwise(u_b)] == [2] * (len(u_b) - 1)


# -- Eq. (1) ---------------------------------------------------------------------------


@pytest.mark.parametrize("last_backup", [True, False])
@pytest.mark.parametrize("m", [1, 2, 3])
@pytest.mark.parametrize("n", [1, 2, 3, 4])
def test_classical_addresses(n: int, m: int, last_backup: bool) -> None:
    for memory_seed in range(2):
        for address in all_addresses(n):
            cfg = backup_config(
                n, m, (InputTerm(address, 1),), last_backup=last_backup, memory_seed=memory_seed
            )
            check_output(cfg)


@pytest.mark.parametrize("last_backup", [True, False])
@pytest.mark.parametrize("n", [1, 2, 3, 4])
def test_random_superpositions(n: int, last_backup: bool) -> None:
    rng = np.random.default_rng(77 * n + last_backup)
    for i in range(50):
        m = int(rng.integers(1, 4))
        terms = random_superposition(n, rng)
        check_output(backup_config(n, m, terms, last_backup=last_backup, memory_seed=i))


def test_unstaggered_query() -> None:
    rng = np.random.default_rng(3)
    for i in range(10):
        check_output(
            backup_config(3, 3, random_superposition(3, rng), memory_seed=i, stagger=False)
        )


@pytest.mark.parametrize("last_backup", [True, False])
def test_time_reversal(last_backup: bool) -> None:
    """E5: routing then inverse routing (no query) returns the input exactly."""
    rng = np.random.default_rng(11)
    for n in (1, 2, 3, 4):
        for _ in range(10):
            m = int(rng.integers(1, 4))
            cfg = backup_config(
                n, m, random_superposition(n, rng), last_backup=last_backup, query=False
            )
            sim = Simulator(cfg)
            initial = sim.variant.initial_state(sim.terms)
            final = sim.run().with_directions(+1)
            assert len(final) == len(initial)
            for br in initial:
                other = final.get(br.key())
                assert other is not None and other.amp == br.amp and other.slots == br.slots


# -- E3: the arXiv chain at level 1 ------------------------------------------------------


def test_e3_chain_of_gates() -> None:
    """arXiv appendix §BackupGates, n = 2, m = 2, a = 10, no D̃_2: Û_in turns Ã₁ blue, then
    Û_B with controls Ã₁, Ã₂, D̃₁ turns (A₂: ∅ stays ∅) Ã₂, then D₁ D̃₁, then D₂ blue."""
    cfg = get_preset("E3").config
    result = simulate(cfg)
    assert result.metrics["fidelity"] >= 1 - TOL
    names = {s.index: s.name for s in result.variant.slots}
    level1 = [
        e
        for _, e in result.trajectory.events()
        if e["kind"] == "gate" and e["level"] == 1 and e["phase"] == "routing"
    ]
    assert [e["type"] for e in level1] == ["U_in", "U_B", "U_B", "U_B"]
    flips = [
        sorted(names[c["k"]] for c in e["changes"] if not c.get("ghost") and c["to"] == "B")
        for e in level1
    ]
    assert flips == [["At_1"], ["At_2"], ["D_1", "Dt_1"], ["D_2"]]
    assert any(c.get("ghost") and names[c["k"]] == "A_2" for c in level1[1]["changes"])


def test_e3_level_checkpoint() -> None:
    sim = Simulator(get_preset("E3").config)
    snaps = SnapshotRecorder()
    sim.run([snaps])
    cps = {cp.name: cp for cp in paper_checkpoints(sim, snaps)}
    after = ket_branch(cps["ψ_1"].branches[0], sim.variant.slots)
    # tail → front: D₂ D̃₁ D₁ Ã₂ A₂ Ã₁ A₁ on edge (1,1), as in the appendix
    assert after == (
        "|B^{1,1}⟩_{D2} |B^{1,1}⟩_{D̃1} |B^{1,1}⟩_{D1} |B^{1,1}⟩_{Ã2} |∅^{1}⟩_{A2} "
        "|B^{1,1}⟩_{Ã1} |R^{1,1}⟩_{A1}"
    )
    before = ket_branch(cps["ψ_in"].branches[0], sim.variant.slots)
    assert before.count("|R^{1,1}⟩") == 6 and "|∅^{1}⟩_{A2}" in before
    assert (
        cps["output"].branches[0].present
        == sim.variant.ideal_output(sim.terms).branches()[0].present
    )


# -- E4: pipelining (technical paper, §Depth reduction bullets) -----------------------


def occupancy(frame_state, level: int) -> dict[int, str]:  # type: ignore[no-untyped-def]
    """Site → slot name on edges of `level` (the one holding the train), present or ghost."""
    out = {}
    for w in frame_state.walkers:
        rec = w.pos if w.s != "E" else (w.ghost.pos if w.ghost else None)
        if rec and rec[0] == level:
            out[rec[2]] = w.k
    return out


def test_e4_pipelining_bullets() -> None:
    n, m, d = 4, 2, 1
    cfg = backup_config(n, m, (InputTerm("0000", 1),), frames=True)
    result = simulate(cfg)
    sched = result.schedule
    slots = {s.name: s.index for s in result.variant.slots}
    frames = result.trajectory.frames  # frames[t + 1] = end of tick t = start of tick t + 1
    u_in = {g.level: g.tick for g in sched.forward if g.kind is GateKind.U_IN}
    t0 = u_in[d]

    def at(t: int, level: int) -> dict[int, int]:
        return occupancy(frames[t].branches[0], level)  # start of tick t

    def name(k: int) -> str:
        return next(s for s, i in slots.items() if i == k)

    # (a)-(b): A_d, Ã_d, A_{d+1} on sites 3, 2, 1 when Û_in fires on (Ã_d, A_d)
    occ = at(t0, d)
    assert [name(occ[s]) for s in (3, 2, 1)] == ["A_1", "At_1", "A_2"]
    # two-site shift: A_d on site 1 of level d+1, Ã_d on site 4; A_{d+1}, Ã_{d+1}, A_{d+2} on 3,2,1
    occ, nxt = at(t0 + 2, d), at(t0 + 2, d + 1)
    assert name(nxt[1]) == "A_1"
    assert [name(occ[s]) for s in (4, 3, 2, 1)] == ["At_1", "A_2", "At_2", "A_3"]
    ub = {(g.level, g.control_slot): g.tick for g in sched.forward if g.kind is GateKind.U_B}
    assert ub[(d, slots["At_1"])] == t0 + 2  # (c) Û_B on (Ã_{d+1}, A_{d+1} | Ã_d)
    # another shift: Ã_d at site 2 of level d+1, A_{d+1} at site 1; Ã_{d+1} at site 4 of level d
    occ, nxt = at(t0 + 4, d), at(t0 + 4, d + 1)
    assert [name(nxt[s]) for s in (2, 1)] == ["At_1", "A_2"]
    assert [name(occ[s]) for s in (4, 3, 2, 1)] == ["At_2", "A_3", "At_3", "A_4"]
    assert ub[(d, slots["At_2"])] == t0 + 4  # (d)
    # another shift: (A_{d+2}, Ã_{d+1}, A_{d+1}, Ã_d) on sites 1..4 of level d+1, mirroring level d
    occ, nxt = at(t0 + 6, d), at(t0 + 6, d + 1)
    assert [name(nxt[s]) for s in (1, 2, 3, 4)] == ["A_3", "At_2", "A_2", "At_1"]
    assert [name(occ[s]) for s in (1, 2, 3, 4)] == ["D_1", "At_4", "A_4", "At_3"]
    # (e) Û_B at level d on (Ã_{d+3}, A_{d+3} | Ã_{d+2}) together with Û_in at level d+1
    assert ub[(d, slots["At_3"])] == t0 + 6 == u_in[d + 1]
    # (f) from now on Û_B at levels d and d+1 fire in the same ticks
    level_d = {t for (lv, _), t in ub.items() if lv == d and t > t0 + 6}
    level_d1 = {t for (lv, _), t in ub.items() if lv == d + 1}
    assert level_d & level_d1
    concurrent = [t for t in level_d1 if t in level_d]
    assert concurrent == sorted(concurrent) and min(concurrent) == t0 + 8
    assert result.metrics["fidelity"] >= 1 - TOL


def test_inverse_routing_mirrors_forward_gates() -> None:
    sim = Simulator(backup_config(2, 2, (InputTerm("11", 1),)))
    inv = sim.schedule.inverse
    assert all(g.phase is Phase.INVERSE for g in inv)
    # within a level, the inverse fires the Û_B tail-first and Û_in last (DECISION D2)
    lvl1 = [g for g in sorted(inv, key=lambda g: g.tick) if g.level == 1]
    assert lvl1[-1].kind is GateKind.U_IN
    assert [g.control_slot for g in lvl1[:-1]] == sorted(
        (g.control_slot for g in lvl1[:-1]), reverse=True
    )


def test_mixed_copy_mode_rejected() -> None:
    from qramsim.config import ConfigError

    cfg = backup_config(2, 1, (InputTerm("10", 1),))
    with pytest.raises(ConfigError):
        Simulator(replace(cfg, copy_mode="global"))
    with pytest.raises(ConfigError):
        Simulator(replace(cfg, variant="basic", copy_mode="backup"))
