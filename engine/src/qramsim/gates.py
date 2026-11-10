"""Gate tables of the bosonic variants (PROTOCOL.md §2–3); qudit and dual-rail tables are
in :mod:`qramsim.rules`.

Every ideal gate is a permutation of the computational basis and is defined here by
lookup tables on the bosonic alphabet ``{∅, R, B}``. Controlled gates have the
projector form ``Σ_c Π_c ⊗ V_c`` with ``V_c`` a product of single-site tables, so a gate
on a long window is stored as (activating control value, per-target table) instead of
a table exponential in the window size. Full window tables are available for tests.

The scattering gate ``Ŝ`` is a passive single-walker permutation of the three ports of
a bifurcation; it is completed to a unitary as in the arXiv appendix (Eq. hatS).
"""

from __future__ import annotations

import itertools
from collections.abc import Mapping
from enum import StrEnum

from .alphabet import BLUE, EMPTY, RED

LocalTable = Mapping[int, int]

BOSONIC_STATES: tuple[int, ...] = (EMPTY, RED, BLUE)

# Colour NOT X̂ and identity on {∅, R, B}.
X_TABLE: dict[int, int] = {EMPTY: EMPTY, RED: BLUE, BLUE: RED}
I_TABLE: dict[int, int] = {EMPTY: EMPTY, RED: RED, BLUE: BLUE}

# Local copy Û_copy^loc(D_j | M_j) (technical paper, Eq. (locCopy)), keyed by the stored
# bit b_j: M_j = R (b_j = 1) → identity; M_j = ∅ (b_j = 0) → swap R ↔ ∅ on D_j, B → B.
LOC_COPY: dict[int, dict[int, int]] = {
    0: {EMPTY: RED, RED: EMPTY, BLUE: BLUE},
    1: dict(I_TABLE),
}


def memory_state(bit: int) -> int:
    """Local state of memory qubit ``M_j`` storing ``bit`` (0 → ∅, 1 → R)."""
    return RED if bit else EMPTY


class GateKind(StrEnum):
    """Clock-scheduled gate types."""

    U = "U"  # address transmission Û⁽ᵈ⁾ (long range, basic)
    COPY_GLOBAL = "copy_global"  # Û_copy⁽ᵃ⁾ controlled by the flag D_0
    CELL_ON = "cell_on"  # Û_on(F | D_0)
    COPY_CELL = "copy_cell"  # Û_copy(F): local copies while the switch is on
    CELL_OFF = "cell_off"  # Û_off(F | D_{m+1})
    U_IN = "U_in"  # Û_in(Ã_d | A_d): CNOT, backup variant
    U_B = "U_B"  # Û_B(W_{i+1}, W̃_{i+1} | W̃_i): C-NOT-NOT activated by blue, backup variant
    COPY_BACKUP = "copy_backup"  # Û_copy(D_j, M_j | D̃_{j-1}), backup variant
    OUT_S = "S_M"  # dual-rail output circuit: Ŝ_M on the ↓ lane (D33)
    OUT_SDAG = "S_M_dag"  # dual-rail output circuit: Ŝ_M† merging aux into ↑ (D33)
    X_C = "X_c"  # dual-rail output circuit: clocked colour NOT on ↑, data slots only (D33)


# Control value that activates each walker-controlled gate (PROTOCOL.md §2). Note the
# asymmetry: Û_B is activated by a **blue** backup (technical paper, §Backup variant).
ACTIVE_ON: dict[GateKind, int] = {
    GateKind.U: RED,
    GateKind.COPY_GLOBAL: RED,
    GateKind.CELL_ON: RED,
    GateKind.CELL_OFF: RED,
    GateKind.U_IN: RED,
    GateKind.U_B: BLUE,
    GateKind.COPY_BACKUP: RED,
}

# Gates whose targets receive the colour NOT X̂ (and whose ghosts follow it).
X_GATES = frozenset({GateKind.U, GateKind.U_IN, GateKind.U_B})
COPY_GATES = frozenset({GateKind.COPY_GLOBAL, GateKind.COPY_CELL, GateKind.COPY_BACKUP})
# Uncontrolled elements of the dual-rail cells: they act on every walker of their window.
LANE_GATES = frozenset({GateKind.OUT_S, GateKind.OUT_SDAG, GateKind.X_C})
# Passive elements, like Ŝ: no control and no clock, so no failure or jitter (D35).
PASSIVE_GATES = frozenset({GateKind.OUT_S, GateKind.OUT_SDAG})


def target_table(kind: GateKind, bit: int | None = None) -> LocalTable:
    """Single-site table applied to each target when the gate is active."""
    if kind in X_GATES:
        return X_TABLE
    if kind in COPY_GATES:
        if bit is None:
            raise ValueError("copy gates need the stored bit of the target's memory qubit")
        return LOC_COPY[bit]
    raise ValueError(f"{kind} has no walker targets")


# ---------------------------------------------------------------------------
# Full window tables (tests, documentation). Windows list the control first.


def controlled_window_table(
    kind: GateKind, n_targets: int, bits: tuple[int, ...] | None = None
) -> dict[tuple[int, ...], tuple[int, ...]]:
    """Table of a walker-controlled gate on (control, target_1, …, target_k)."""
    table: dict[tuple[int, ...], tuple[int, ...]] = {}
    tables = [target_table(kind, None if bits is None else bits[i]) for i in range(n_targets)]
    for window in itertools.product(BOSONIC_STATES, repeat=n_targets + 1):
        ctrl, targets = window[0], window[1:]
        if ctrl == ACTIVE_ON[kind]:
            new = tuple(tables[i][t] for i, t in enumerate(targets))
        else:
            new = targets
        table[window] = (ctrl, *new)
    return table


def switch_window_table(kind: GateKind) -> dict[tuple[int, bool], tuple[int, bool]]:
    """Table of Û_on / Û_off on (control walker, switch F) with F ∈ {off, on}."""
    if kind not in (GateKind.CELL_ON, GateKind.CELL_OFF):
        raise ValueError(f"{kind} is not a switch gate")
    return {
        (c, f): (c, (not f) if c == ACTIVE_ON[kind] else f)
        for c in BOSONIC_STATES
        for f in (False, True)
    }


def copy_cell_window_table(
    bits: tuple[int, ...],
) -> dict[tuple[bool, tuple[int, ...]], tuple[bool, tuple[int, ...]]]:
    """Table of Û_copy(F) on (switch F, D_1 … D_k) for stored bits ``bits``."""
    table: dict[tuple[bool, tuple[int, ...]], tuple[bool, tuple[int, ...]]] = {}
    for f in (False, True):
        for targets in itertools.product(BOSONIC_STATES, repeat=len(bits)):
            new = (
                tuple(LOC_COPY[b][t] for b, t in zip(bits, targets, strict=True)) if f else targets
            )
            table[(f, targets)] = (f, new)
    return table


def loc_copy_table() -> dict[tuple[int, int], tuple[int, int]]:
    """Û_copy^loc on (M_j, D_j) over the full three-state memory alphabet (technical paper,
    Eq. (locCopy))."""
    table: dict[tuple[int, int], tuple[int, int]] = {}
    for mem in BOSONIC_STATES:
        for d in BOSONIC_STATES:
            new = LOC_COPY[0][d] if mem == EMPTY else d
            table[(mem, d)] = (mem, new)
    return table


# ---------------------------------------------------------------------------
# Scattering gate Ŝ at a bifurcation (PROTOCOL.md §3.2–3.3).


class Port(StrEnum):
    PARENT = "parent"
    LEFT = "left"
    RIGHT = "right"


# Single-particle part of Ŝ (arXiv Eq. hatS): (colour, incoming port) → (colour,
# outgoing port). Only the first two rows act in the ideal forward dynamics.
S_TABLE: dict[tuple[int, Port], tuple[int, Port]] = {
    (RED, Port.PARENT): (RED, Port.LEFT),
    (BLUE, Port.PARENT): (RED, Port.RIGHT),
    (RED, Port.LEFT): (BLUE, Port.RIGHT),
    (RED, Port.RIGHT): (BLUE, Port.LEFT),
    (BLUE, Port.LEFT): (BLUE, Port.PARENT),
    (BLUE, Port.RIGHT): (RED, Port.PARENT),
}

# Ŝ† is the exact inverse permutation. A walker moving backward arrives from a child
# port: red walkers go up (from the right child they become blue); a blue walker is
# bounced into the sibling edge (completion terms, noise only).
S_DAG_TABLE: dict[tuple[int, Port], tuple[int, Port]] = {v: k for k, v in S_TABLE.items()}
