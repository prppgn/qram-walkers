"""Geometry, train, clock schedule (PROTOCOL.md §1.2, §1.4, §4)."""

from __future__ import annotations

from dataclasses import replace

import pytest

from qramsim import InputTerm
from qramsim.config import ConfigError, Options
from qramsim.gates import GateKind
from qramsim.geometry import Geometry, all_addresses
from qramsim.schedule import Phase
from qramsim.simulator import Simulator
from qramsim.train import SlotRole

from helpers import config


def test_cell_address_map() -> None:
    geo = Geometry(2, (4, 3, 4))
    assert geo.cell_of_address("00") == 1
    assert geo.cell_of_address("10") == 3  # PROTOCOL.md §1.4 example
    assert geo.cell_of_address("11") == 4
    for l in range(1, 5):
        assert geo.cell_of_address(geo.address_of_cell(l)) == l
    assert geo.children(1, 1) == ((2, 1), (2, 2))
    assert geo.children(2, 2) == ((3, 3), (3, 4))
    assert geo.X(1, 1) == 1 and geo.X(2, 1) == 5 and geo.X(3, 1) == 8
    assert geo.sites_path == 11
    assert geo.sites_total == 4 + 2 * 3 + 4 * 4
    with pytest.raises(ValueError):
        geo.cell_of_address("102")


@pytest.mark.parametrize("mode,K", [("global", 7), ("cell_switch", 8)])
def test_basic_train_and_edges(mode: str, K: int) -> None:
    sim = Simulator(config(3, 3, (InputTerm("101", 1),), copy_mode=mode))
    v = sim.variant
    names = [s.name for s in v.slots]
    expected = ["A_1", "A_2", "A_3", "D_0", "D_1", "D_2", "D_3"]
    if mode == "cell_switch":
        expected.append("D_4")
        assert v.slots[-1].role is SlotRole.DELIMITER
    assert names == expected
    assert v.K == K
    # n_sites(d) = K − d + 1 on the tree, K in the memory lane (PROTOCOL.md §4.1)
    assert v.geometry.level_sites == (K, K - 1, K - 2, K)
    assert v.encode("101") == (1, 0, 1, *([1] * (K - 3)))
    assert sim.schedule.T_fwd == v.geometry.X(4, 1) + K - 1


def test_forward_schedule_formula() -> None:
    sim = Simulator(config(3, 2, (InputTerm("101", 1),)))
    geo = sim.geometry
    us = [g for g in sim.schedule.forward if g.kind is GateKind.U]
    assert [g.level for g in us] == [1, 2, 3]
    for g in us:
        d = g.level
        last = geo.sites(d)
        assert g.tick == geo.X(d, last) + (d - 1)
        assert g.control_site == last
        assert g.target_sites == tuple(range(last - 1, 0, -1))
        assert g.control_slot == d - 1
        assert g.target_slots == tuple(range(d, sim.variant.K))
        assert g.phase is Phase.ROUTING


@pytest.mark.parametrize(
    "mode,stagger,T_q",
    [
        ("global", True, 3),
        ("global", False, 1),
        ("cell_switch", True, 5),
        ("cell_switch", False, 3),
    ],
)
def test_query_schedule(mode: str, stagger: bool, T_q: int) -> None:
    sim = Simulator(config(2, 3, (InputTerm("10", 1),), copy_mode=mode, stagger=stagger))
    sched = sim.schedule
    assert sched.T_q == T_q
    assert sched.T_total == 2 * sched.T_fwd + T_q
    q = sched.query
    K = sim.variant.K
    k_d0 = 2
    if mode == "global":
        assert all(g.kind is GateKind.COPY_GLOBAL for g in q)
        assert all(g.control_site == K - k_d0 for g in q)
    else:
        assert q[0].kind is GateKind.CELL_ON and q[0].tick == sched.T_fwd
        assert q[-1].kind is GateKind.CELL_OFF and q[-1].tick == sched.T_fwd + T_q - 1
        assert q[-1].control_site == K - (K - 1)  # the delimiter rests on lane site 1
    targets = sorted(s for g in q for s in g.target_sites)
    assert targets == sorted(K - (k_d0 + j) for j in (1, 2, 3))


def test_site_overrides() -> None:
    cfg = config(2, 1, (InputTerm("10", 1),))
    longer = Simulator(replace(cfg, options=Options(n_sites={"1": 9, "2": 5, "memory": 6})))
    assert longer.geometry.level_sites == (9, 5, 6)
    assert not longer.variant.warnings
    with pytest.raises(ConfigError):
        Simulator(replace(cfg, options=Options(n_sites={"memory": 3})))
    shorter = Simulator(replace(cfg, options=Options(n_sites={"1": 2})))
    assert shorter.variant.warnings  # long-range window shorter than the train


def test_longer_edges_still_correct() -> None:
    from qramsim import simulate

    for a in all_addresses(2):
        cfg = config(2, 2, (InputTerm(a, 1),))
        cfg = replace(cfg, options=Options(strict=True, n_sites={"1": 9, "2": 7, "memory": 8}))
        assert simulate(cfg).metrics["fidelity"] > 1 - 1e-12
