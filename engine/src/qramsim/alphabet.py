"""Local-state alphabets of a single walker slot (PROTOCOL.md §1.3, §3.1).

Every slot of the train carries a local state from a small finite alphabet that
depends on the variant family. The bosonic alphabet (basic and backup variants) has
the vacuum ``∅`` as a logical state; the qudit and dual-rail alphabets have no vacuum
(walkers are always present). Local states are ``IntEnum`` members so that gate tables
are plain dictionaries on small integers.

In the engine the vacuum ``∅`` is represented by a slot whose ``present`` flag is
false (the slot then keeps a *ghost* for rendering, PROTOCOL.md §4.6); the alphabet
member :data:`Bosonic.E` is what gates see on such a slot.
"""

from __future__ import annotations

from enum import IntEnum, StrEnum


class Family(StrEnum):
    """Alphabet family of a variant."""

    BOSONIC = "bosonic"
    QUDIT = "qudit"
    DUALRAIL = "dualrail"


class Bosonic(IntEnum):
    """Bosonic encoding: no walker, red walker, blue walker."""

    E = 0  # ∅ (vacuum)
    R = 1
    B = 2


class Qudit(IntEnum):
    """Qudit encoding: logical bit (○ = 0, ● = 1) × routing colour (R, B)."""

    oR = 0
    oB = 1
    fR = 2
    fB = 3


class DualRail(IntEnum):
    """Dual-rail encoding: rail (u = ↑ = 0, d = ↓ = 1) × colour (R, B).

    ``xR``, ``xB`` are the auxiliary rail of the memory output circuit (technical paper,
    §dual_rail_mem; DECISION D33); a walker is there only between Ŝ_M and Ŝ_M† during the query.
    """

    uR = 0
    uB = 1
    dR = 2
    dB = 3
    xR = 4
    xB = 5


EMPTY = int(Bosonic.E)
RED = int(Bosonic.R)
BLUE = int(Bosonic.B)
# An empty slot in the Kraus tables of the families with no ∅ in their alphabet: a walker
# can still be lost there (DECISION D35).
NO_WALKER = -1

# Colour NOT X̂ (PROTOCOL.md §3.1): R ↔ B, ∅ → ∅. On qudits / dual-rail it flips the
# colour and keeps the logical bit / rail.
COLOUR_NOT: dict[Family, dict[int, int]] = {
    Family.BOSONIC: {Bosonic.E: Bosonic.E, Bosonic.R: Bosonic.B, Bosonic.B: Bosonic.R},
    Family.QUDIT: {Qudit.oR: Qudit.oB, Qudit.oB: Qudit.oR, Qudit.fR: Qudit.fB, Qudit.fB: Qudit.fR},
    Family.DUALRAIL: {
        DualRail.uR: DualRail.uB,
        DualRail.uB: DualRail.uR,
        DualRail.dR: DualRail.dB,
        DualRail.dB: DualRail.dR,
        DualRail.xR: DualRail.xB,
        DualRail.xB: DualRail.xR,
    },
}

# Logical NOT X̂^L of the qudit alphabet (PROTOCOL.md §3.7): ○ ↔ ●, colour kept.
QUDIT_LOGICAL_NOT: dict[int, int] = {
    Qudit.oR: Qudit.fR,
    Qudit.fR: Qudit.oR,
    Qudit.oB: Qudit.fB,
    Qudit.fB: Qudit.oB,
}

_SHORT: dict[Family, dict[int, str]] = {
    Family.BOSONIC: {Bosonic.E: "E", Bosonic.R: "R", Bosonic.B: "B"},
    Family.QUDIT: {Qudit.oR: "oR", Qudit.oB: "oB", Qudit.fR: "fR", Qudit.fB: "fB"},
    Family.DUALRAIL: {
        DualRail.uR: "uR",
        DualRail.uB: "uB",
        DualRail.dR: "dR",
        DualRail.dB: "dB",
        DualRail.xR: "xR",
        DualRail.xB: "xB",
    },
}
_FROM_SHORT: dict[Family, dict[str, int]] = {
    fam: {v: k for k, v in table.items()} for fam, table in _SHORT.items()
}
_GLYPH: dict[Family, dict[int, str]] = {
    Family.BOSONIC: {Bosonic.E: "∅", Bosonic.R: "R", Bosonic.B: "B"},
    Family.QUDIT: {Qudit.oR: "○R", Qudit.oB: "○B", Qudit.fR: "●R", Qudit.fB: "●B"},
    Family.DUALRAIL: {
        DualRail.uR: "↑R",
        DualRail.uB: "↑B",
        DualRail.dR: "↓R",
        DualRail.dB: "↓B",
        DualRail.xR: "aux R",
        DualRail.xB: "aux B",
    },
}


def alphabet(family: Family) -> tuple[int, ...]:
    """All local states of a family, in enum order."""
    return tuple(_SHORT[family])


def colour_not(family: Family, s: int) -> int:
    """Apply the colour NOT X̂ to a local state."""
    return COLOUR_NOT[family][s]


def short(family: Family, s: int) -> str:
    """Short JSON string of a local state (``E,R,B`` / ``oR,…`` / ``uR,…``)."""
    return _SHORT[family][s]


def from_short(family: Family, text: str) -> int:
    """Inverse of :func:`short`."""
    try:
        return _FROM_SHORT[family][text]
    except KeyError as exc:
        raise ValueError(f"unknown {family} local state {text!r}") from exc


def glyph(family: Family, s: int) -> str:
    """Display glyph in the paper's notation (``∅``, ``R``, ``●B``, ``↑R``…)."""
    return _GLYPH[family][s]
