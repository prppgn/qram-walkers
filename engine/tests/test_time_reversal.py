"""E5: routing followed immediately by inverse routing returns the input exactly."""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest

from qramsim import InputTerm, simulate
from qramsim.config import fill_memory
from qramsim.geometry import all_addresses
from qramsim.simulator import Simulator

from helpers import config, random_superposition


def same_state_exactly(a, b) -> None:  # type: ignore[no-untyped-def]
    """Equal keys, bitwise-equal amplitudes, equal ghosts and branch ids."""
    assert len(a) == len(b)
    for br in a:
        other = b.get(br.key())
        assert other is not None
        assert other.amp == br.amp
        assert other.slots == br.slots  # ghosts included
        assert other.bid == br.bid


@pytest.mark.parametrize("mode", ["global", "cell_switch"])
@pytest.mark.parametrize("n", [1, 2, 3, 4])
def test_no_query_is_identity(n: int, mode: str) -> None:
    rng = np.random.default_rng(n)
    for _ in range(20):
        m = int(rng.integers(1, 4))
        terms = random_superposition(n, rng)
        cfg = config(n, m, terms, copy_mode=mode, query=False)
        sim = Simulator(cfg)
        initial = sim.variant.initial_state(sim.terms)
        final = sim.run()
        assert sim.schedule.T_q == 0
        same_state_exactly(final.with_directions(+1), initial)


def test_trivial_memory_is_identity_on_data() -> None:
    """With every stored bit equal to 1 the query acts trivially: output = input reversed."""
    rng = np.random.default_rng(5)
    for n in (1, 2, 3):
        for m in (1, 2):
            terms = random_superposition(n, rng)
            cfg = config(n, m, terms)
            cfg = replace(cfg, memory=fill_memory(n, m, "ones", None))
            sim = Simulator(cfg)
            initial = sim.variant.initial_state(sim.terms)
            same_state_exactly(sim.run().with_directions(+1), initial)


def test_inverse_schedule_mirrors_forward() -> None:
    sim = Simulator(config(3, 2, (InputTerm("101", 1),)))
    sched = sim.schedule
    assert len(sched.inverse) == len(sched.forward)
    by_id = {g.id: g for g in sched.forward}
    for g in sched.inverse:
        f = by_id[g.id]
        assert g.tick == sched.T_fwd + sched.T_q + (sched.T_fwd - 1 - f.tick)
        assert sched.mirror(g.tick) == f.tick
        assert (g.window, g.level, g.kind) == (f.window, f.level, f.kind)


def test_trajectory_frames_mirror() -> None:
    """Positions in frame (inverse, after undoing tick t) equal forward start of tick t."""
    cfg = config(2, 1, tuple(InputTerm(a, 1) for a in all_addresses(2)), query=False, frames=True)
    traj = simulate(cfg).trajectory
    T = traj.meta["phases"]["T_fwd"]
    frames = traj.frames  # frames[i] = end of tick i - 1
    for t in range(T):
        fwd = frames[t]  # end of tick t - 1 = start of tick t
        inv = frames[1 + (2 * T - 1 - t)]  # end of inverse tick replaying t
        for bf, bi in zip(fwd.branches, inv.branches, strict=True):
            for wf, wi in zip(bf.walkers, bi.walkers, strict=True):
                assert wf.s == wi.s
                assert wf.pos == wi.pos
                if wf.ghost is not None and wi.ghost is not None:
                    assert wf.ghost.pos == wi.ghost.pos
                    assert wf.ghost.c == wi.ghost.c
