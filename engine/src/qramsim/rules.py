"""Per-variant gate rules: scattering, activation and target tables (PROTOCOL.md §3).

The tick loop is shared by all variants. What a variant changes is how a local state
crosses a bifurcation and which control states activate a gate with which table on its
targets. Each variant owns a :class:`Rules` object:

* bosonic (basic, backup): the tables of :mod:`qramsim.gates`, unchanged;
* qudit (technical paper, §Qudit variant): ``qudit_long`` routes the ``●`` subspace with
  Ŝ and the ``○`` subspace with Ŝ X̂ (the dual-rail orientation, DECISION D32), with the
  same-subspace Û⁽ᵈ⁾ = Û_○ ⊕ Û_●; ``qudit_short`` routes by colour only (Ŝ_sr) and
  transmits the address with Û_in (logical control) and Û_B (colour control);
* dual-rail (technical paper, §Dual-rail implementations): the local state carries the
  rail, i.e. the tree the walker moves on; Ŝ⁽↓⁾ = Ŝ, Ŝ⁽↑⁾ = Ŝ X̂ (Eqs. ScattRail1/0);
  every gate acts on the tree of its control; the output circuit of the cells (Ŝ_M,
  Ŝ_M†, X̂_c) moves the data walkers that read a 0 from ``↓`` to ``↑`` (DECISION D33).

A "mirrored" sector scatters with Ŝ X̂ forward and (Ŝ X̂)† = X̂ Ŝ† backward, read as
operators on the whole three-port space (the completion terms only matter under noise).
"""

from __future__ import annotations

from collections.abc import Mapping

from .alphabet import BLUE, EMPTY, RED, DualRail, Family, Qudit
from .alphabet import short as _short
from .gates import ACTIVE_ON, COPY_GATES, S_DAG_TABLE, S_TABLE, GateKind, Port, target_table

DR, Q = DualRail, Qudit  # short names for the gate tables

LocalTable = Mapping[int, int]

# -- qudit tables (technical paper, §Qudit variant) ---------------------------------------

QUDIT_XC: dict[int, int] = {Q.oR: Q.oB, Q.oB: Q.oR, Q.fR: Q.fB, Q.fB: Q.fR}  # colour NOT
QUDIT_XC0: dict[int, int] = {Q.oR: Q.oB, Q.oB: Q.oR, Q.fR: Q.fR, Q.fB: Q.fB}  # on ○ only
QUDIT_XC1: dict[int, int] = {Q.oR: Q.oR, Q.oB: Q.oB, Q.fR: Q.fB, Q.fB: Q.fR}  # on ● only
QUDIT_XL: dict[int, int] = {Q.oR: Q.fR, Q.fR: Q.oR, Q.oB: Q.fB, Q.fB: Q.oB}  # logical NOT
QUDIT_I: dict[int, int] = {s: s for s in Q}

# -- dual-rail tables (technical paper, §Dual-rail implementations) -------------------------

DR_X: dict[int, int] = {
    DR.uR: DR.uB,
    DR.uB: DR.uR,
    DR.dR: DR.dB,
    DR.dB: DR.dR,
    DR.xR: DR.xB,
    DR.xB: DR.xR,
}
DR_I: dict[int, int] = {s: s for s in DR}


def _swap(a: int, b: int) -> dict[int, int]:
    table = dict(DR_I)
    table[a], table[b] = b, a
    return table


# Output circuit (D33), completed to permutations: Ŝ_M swaps (↓,B) ↔ (aux,R); Ŝ_M† swaps
# (aux,R) ↔ (↑,B); X̂_c, placed on ↑, swaps (↑,B) ↔ (↑,R).
DR_OUT_S: dict[int, int] = _swap(DR.dB, DR.xR)
DR_OUT_SDAG: dict[int, int] = _swap(DR.xR, DR.uB)
DR_XC_OUT: dict[int, int] = _swap(DR.uB, DR.uR)

_X_KINDS = frozenset({GateKind.U, GateKind.U_IN, GateKind.U_B})
_FLAG_KINDS = frozenset(
    {GateKind.COPY_GLOBAL, GateKind.CELL_ON, GateKind.CELL_OFF, GateKind.COPY_BACKUP}
)


class Rules:
    """Bosonic rules (basic and backup variants): the tables of :mod:`qramsim.gates`."""

    family: Family = Family.BOSONIC
    has_vacuum: bool = True  # the slot alphabet contains ∅ (gates may create walkers)
    trees: int = 1

    def tree(self, s: int) -> int:
        """Tree a walker in local state ``s`` moves on (the rail, for dual-rail)."""
        return 0

    def colour(self, s: int) -> int:
        """Routing colour ``RED``/``BLUE`` of a local state (``EMPTY`` for ∅)."""
        return s

    def with_colour(self, s: int, c: int) -> int:
        return c

    def mirrored(self, s: int) -> bool:
        """Whether the sector of ``s`` scatters with Ŝ X̂ instead of Ŝ."""
        return False

    def scatter_fwd(self, s: int) -> tuple[int, Port]:
        """Forward crossing of a bifurcation from the parent edge: (new state, port)."""
        c = self.colour(s)
        if self.mirrored(s):
            c = BLUE if c == RED else RED
        c_out, port = S_TABLE[(c, Port.PARENT)]
        return self.with_colour(s, c_out), port

    def scatter_bwd(self, s: int, port: Port) -> tuple[int, Port]:
        """Backward crossing from a child port: (new state, outgoing port)."""
        c_out, out = S_DAG_TABLE[(self.colour(s), port)]
        if self.mirrored(s):
            c_out = BLUE if c_out == RED else RED
        return self.with_colour(s, c_out), out

    def active(self, kind: GateKind, s: int) -> bool:
        """Whether control state ``s`` activates a walker-controlled gate."""
        return ACTIVE_ON[kind] == s

    def target_table(self, kind: GateKind, control: int | None, bit: int | None) -> LocalTable:
        """Table applied to each target of an active gate (``bit``: stored bit of the
        target's memory qubit, copy gates only)."""
        return target_table(kind, bit)

    def copy_tree(self) -> int:
        """Tree of the lane sites the memory qubits act on."""
        return 0

    def ghost_of_aux(self) -> int:
        raise NotImplementedError("only dual-rail variants have an auxiliary rail")

    def short(self, s: int) -> str:
        return _short(self.family, s)

    def is_vacuum(self, s: int) -> bool:
        return self.has_vacuum and s == EMPTY


class QuditRules(Rules):
    """Qudit rules; ``long`` selects Û⁽ᵈ⁾ + subspace Ŝ, otherwise Û_in/Û_B + Ŝ_sr."""

    family = Family.QUDIT
    has_vacuum = False

    def __init__(self, long: bool) -> None:
        self.long = long

    @staticmethod
    def logical(s: int) -> int:
        return 1 if s in (Q.fR, Q.fB) else 0

    def colour(self, s: int) -> int:
        return RED if s in (Q.oR, Q.fR) else BLUE

    def with_colour(self, s: int, c: int) -> int:
        if self.logical(s):
            return Q.fR if c == RED else Q.fB
        return Q.oR if c == RED else Q.oB

    def mirrored(self, s: int) -> bool:
        return self.long and self.logical(s) == 0  # DECISION D32

    def active(self, kind: GateKind, s: int) -> bool:
        if kind is GateKind.U:
            return s in (Q.oR, Q.fR)
        if kind is GateKind.U_IN:
            return self.logical(s) == 1
        if kind is GateKind.U_B:
            return self.colour(s) == BLUE
        if kind in _FLAG_KINDS:
            return s == Q.fR
        raise ValueError(f"{kind} is not a qudit gate")

    def target_table(self, kind: GateKind, control: int | None, bit: int | None) -> LocalTable:
        if kind is GateKind.U:
            return QUDIT_XC0 if control == Q.oR else QUDIT_XC1
        if kind in (GateKind.U_IN, GateKind.U_B):
            return QUDIT_XC
        if kind in COPY_GATES:
            if bit is None:
                raise ValueError("copy gates need the stored bit")
            return QUDIT_XL if bit == 0 else QUDIT_I
        raise ValueError(f"{kind} has no qudit targets")


_DR_TREE: dict[int, int] = {DR.uR: 0, DR.uB: 0, DR.dR: 1, DR.dB: 1}


class DualRailRules(Rules):
    family = Family.DUALRAIL
    has_vacuum = False
    trees = 2

    def ghost_of_aux(self) -> int:
        """Ghost of a walker that left from the auxiliary rail: drawn on the ↓ lane."""
        return DR.dR

    def tree(self, s: int) -> int:
        return _DR_TREE.get(s, 2)  # 2 = auxiliary rail

    def colour(self, s: int) -> int:
        return RED if s in (DR.uR, DR.dR, DR.xR) else BLUE

    def with_colour(self, s: int, c: int) -> int:
        red, blue = {0: (DR.uR, DR.uB), 1: (DR.dR, DR.dB), 2: (DR.xR, DR.xB)}[self.tree(s)]
        return red if c == RED else blue

    def mirrored(self, s: int) -> bool:
        return self.tree(s) == 0  # Ŝ⁽↑⁾ = Ŝ X̂

    def active(self, kind: GateKind, s: int) -> bool:
        if kind in (GateKind.U, GateKind.U_IN):
            return s in (DR.uR, DR.dR)
        if kind is GateKind.U_B:
            return self.colour(s) == BLUE
        if kind in _FLAG_KINDS:
            return s == DR.dR  # flags and copy controls sit on the ↓ lane
        raise ValueError(f"{kind} is not a dual-rail walker-controlled gate")

    def target_table(self, kind: GateKind, control: int | None, bit: int | None) -> LocalTable:
        if kind in _X_KINDS:
            return DR_X
        if kind in COPY_GATES:
            if bit is None:
                raise ValueError("copy gates need the stored bit")
            return DR_X if bit == 0 else DR_I  # M_j = R (0) flips D_j to blue
        if kind is GateKind.OUT_S:
            return DR_OUT_S
        if kind is GateKind.OUT_SDAG:
            return DR_OUT_SDAG
        if kind is GateKind.X_C:
            return DR_XC_OUT
        raise ValueError(f"{kind} has no dual-rail table")

    def copy_tree(self) -> int:
        return 1


_BOSONIC = Rules()


def rules_for(variant: str) -> Rules:
    """Rules of a variant by name."""
    if variant in ("basic", "backup"):
        return _BOSONIC
    if variant == "qudit_long":
        return QuditRules(long=True)
    if variant == "qudit_short":
        return QuditRules(long=False)
    if variant in ("dualrail_basic", "dualrail_backup"):
        return DualRailRules()
    raise ValueError(f"no rules for variant {variant!r}")
