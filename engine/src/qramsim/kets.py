"""Kets in the paper's notation and level-synchronous ("paper") checkpoints.

Formatting
----------
A present walker on edge ``(d, l)`` prints as ``|R^{d,l}⟩_{A1}``; an empty slot as
``|∅^{d}⟩_{A2}`` (the vacuum carries no branch index; ``d`` is the level of its ghost).
In the inverse phase (direction −1) the level gets a prime, ``|R^{2',2}⟩``, as in the
arXiv appendix. Outside the tree the superscript is ``in`` / ``out``. The default order
is the paper's, tail → front (``A_1`` rightmost).

Checkpoints
-----------
The paper writes the state level by level (ψ_in, ψ_1 = Û⁽¹⁾ψ_in, ψ_2 = Ŝψ_1, …) as if
the whole train sat on one level. In the clocked model the train is spread over
several levels at any instant, so the paper's ψ's are *wavefront* states: each slot
``k`` is taken at a tick when it stands on level ``d`` (slot ``k`` reaches site ``s`` of
level ``d`` at tick ``X(d, s) + k``): the walkers behind ``A_d`` at the tick Û⁽ᵈ⁾ fires,
the dispersed walkers ahead of it when they stand on the last site of level ``d``.
Between its arrival on a level and the next bifurcation a walker meets only that
level's gate, and the dynamics of each branch is a permutation, so these per-slot
snapshots compose into exactly the paper's kets. They are used by
``qramsim run --print-kets`` and by the golden tests of PROTOCOL.md §6.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

from . import alphabet
from .geometry import PORT_LEVEL
from .state import Branch, SparseState
from .train import Slot

if TYPE_CHECKING:
    from .schedule import Phase
    from .simulator import Event, Simulator, Stage

_ANSI = {"R": "\x1b[31m", "B": "\x1b[34m", "∅": "\x1b[1m"}
_RESET = "\x1b[0m"


def ket_walker(
    slot: Slot,
    br: Branch,
    family: alphabet.Family = alphabet.Family.BOSONIC,
    *,
    color: bool = False,
    latex: bool = False,
) -> str:
    k = slot.index
    w = br.slots[k]
    present = br.present[k]
    prime = "'" if w.dir < 0 else ""
    if w.level == PORT_LEVEL:
        where = "out" if w.dir < 0 else "in"
        sup = where
    elif present:
        sup = f"{w.level}{prime},{w.branch}"
    else:
        sup = f"{w.level}{prime}"
    g = alphabet.glyph(family, w.s) if present else "∅"
    if latex:
        sym = {"∅": r"\varnothing"}.get(g, g)
        return rf"\ket{{{sym}^{{{sup}}}}}_{{{slot.latex}}}"
    if color and g in _ANSI:
        g = f"{_ANSI[g]}{g}{_RESET}"
    return f"|{g}^{{{sup}}}⟩_{{{slot.ket_label}}}"


def ket_branch(
    br: Branch,
    slots: tuple[Slot, ...],
    family: alphabet.Family = alphabet.Family.BOSONIC,
    *,
    order: str = "paper",
    color: bool = False,
    latex: bool = False,
) -> str:
    seq = list(reversed(slots)) if order == "paper" else list(slots)
    sep = " " if not latex else ""
    body = sep.join(ket_walker(s, br, family, color=color, latex=latex) for s in seq)
    if br.cells_on:
        body += " ⊗ F_on" + "{" + ",".join(str(c) for c in sorted(br.cells_on)) + "}"
    return body


def format_amp(a: complex) -> str:
    re, im = round(a.real, 4) + 0.0, round(a.imag, 4) + 0.0
    if im == 0:
        return f"{re:+.4f}"
    if re == 0:
        return f"{im:+.4f}i"
    return f"({re:.4f}{im:+.4f}i)"


def ket_state(
    branches: list[Branch],
    slots: tuple[Slot, ...],
    family: alphabet.Family = alphabet.Family.BOSONIC,
    *,
    order: str = "paper",
    color: bool = False,
) -> list[str]:
    """One line per branch: ``amplitude · ket``; a lone unit-amplitude branch has no prefix."""
    if len(branches) == 1 and abs(branches[0].amp - 1) < 1e-12:
        return [ket_branch(branches[0], slots, family, order=order, color=color)]
    return [
        f"{format_amp(b.amp)} · " + ket_branch(b, slots, family, order=order, color=color)
        for b in branches
    ]


# ---------------------------------------------------------------------------
# Level-synchronous checkpoints.


class SnapshotRecorder:
    """Keeps every branch at every stage of every tick (small runs only)."""

    def __init__(self) -> None:
        self.snaps: dict[tuple[int, str], dict[int, Branch]] = {}
        self.initial: dict[int, Branch] = {}
        self.final: dict[int, Branch] = {}

    def start(self, sim: Simulator, state: SparseState) -> None:
        self.initial = {b.bid: b for b in state}

    def stage(self, t: int, stage: Stage, state: SparseState) -> None:
        self.snaps[(t, str(stage))] = {b.bid: b for b in state}

    def tick(self, t: int, phase: Phase, state: SparseState, events: list[Event]) -> None:
        pass

    def finish(self, sim: Simulator, state: SparseState) -> None:
        self.final = {b.bid: b for b in state}


@dataclass(frozen=True)
class Checkpoint:
    name: str
    description: str
    branches: list[Branch]
    tick: int  # a tick at which the checkpoint is (partly) visible, for "jump to"


def _wavefront(
    snaps: SnapshotRecorder, K: int, tick_of: list[int], stage: str, bids: list[int]
) -> list[Branch]:
    out = []
    for bid in bids:
        parts = [snaps.snaps[(tick_of[k], stage)].get(bid) for k in range(K)]
        if any(p is None for p in parts):
            continue  # branch merged or split on the way; not a single wavefront
        ps = [p for p in parts if p is not None]
        out.append(
            Branch(
                ps[-1].amp,
                tuple(p.slots[k] for k, p in enumerate(ps)),
                tuple(p.present[k] for k, p in enumerate(ps)),
                ps[-1].cells_on,
                bid,
            )
        )
    return out


def paper_checkpoints(sim: Simulator, snaps: SnapshotRecorder) -> list[Checkpoint]:
    """The paper's level-by-level ket sequence (PROTOCOL.md §6, DECISION D18)."""
    from .variants.backup import level_tag
    from .variants.basic import u_label

    geo = sim.geometry
    sched = sim.schedule
    n, K = sim.variant.n, sim.variant.K
    off = [sim.variant.offset(k) for k in range(K)]
    bids = sorted(snaps.final)
    cps: list[Checkpoint] = []
    idx = 0
    # short-range variants: the address bit travels along the train through local gates
    short_range = sim.variant.name in ("backup", "qudit_short", "dualrail_backup")

    def add(name: str, desc: str, ticks: list[int], stage: str) -> None:
        anchor = ticks[min(K - 1, len(ticks) - 1)] if "after Ŝ" in desc else ticks[-1]
        cps.append(Checkpoint(name, desc, _wavefront(snaps, K, ticks, stage, bids), anchor))

    if short_range:
        # Short edges: a walker is untouched on site 1 and final on the last site (after
        # the tick's gates), whatever its role in the Û_in / Û_B chain.
        def before(d: int) -> list[int]:
            return [geo.X(d, 1) + off[k] for k in range(K)]

        def after(d: int) -> list[int]:
            return [geo.X(d, geo.sites(d)) + off[k] for k in range(K)]

        def gates(d: int) -> str:
            return f"Û_in{level_tag(d)} and the Û_B{level_tag(d)} chain"
    else:
        # Followers of A_d are taken at the tick Û⁽ᵈ⁾ fires (they all sit on level d);
        # the dispersed walkers ahead of A_d when they stand on the last site of level d.
        def before(d: int) -> list[int]:
            return [geo.X(d, geo.sites(d)) + min(k, d - 1) for k in range(K)]

        after = before

        def gates(d: int) -> str:
            return u_label(d)

    add("ψ_in", f"level 1, before {gates(1)}", before(1), "start")
    for d in range(1, n + 1):
        if d > 1:
            idx += 1
            add(f"ψ_{idx}", f"level {d}, after Ŝ (before {gates(d)})", before(d), "start")
        idx += 1
        add(f"ψ_{idx}", f"level {d}, after {gates(d)}", after(d), "post_gates")
    idx += 1
    lane = [geo.X(geo.lane_level, 1) + off[k] for k in range(K)]
    add(f"ψ_{idx}", f"memory level {n + 1}, after Ŝ (before the query)", lane, "start")
    if sched.T_q > 0:
        t_q = sched.T_fwd + sched.T_q
        add("ψ_Q", "after the query (directions reversed)", [t_q] * K, "start")
    for d in range(n, 0, -1):
        idx += 1
        mirrored_after = [sched.mirror(t) for t in after(d)]
        add(f"ψ_{idx}", f"level {d}′, after Ŝ† (before {gates(d)})", mirrored_after, "post_move")
        idx += 1
        name = "ψ_out" if d == 1 else f"ψ_{idx}"
        mirrored_before = [sched.mirror(t) for t in before(d)]
        add(name, f"level {d}′, after {gates(d)}", mirrored_before, "post_gates")
    cps.append(
        Checkpoint(
            "output",
            "all walkers exited through the port",
            [snaps.final[b] for b in bids],
            sched.T_total - 1,
        )
    )
    return cps
