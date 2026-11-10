"""Sparse quantum state of the walker train (DESIGN.md §3.1, PROTOCOL.md §4.6).

The state is a superposition of *branches*. A branch is a basis configuration: for
every slot either a present walker (local state, position, direction) or the vacuum
``∅``. For rendering, every empty slot also keeps a *ghost* — the position, direction
and colour a walker would have — which evolves like a walker but never influences the
physics. Ghost data is therefore **not** part of the branch key: two branches that
differ only in ghosts are the same physical branch, and when such branches merge the
ghosts of the larger amplitude are kept.

Each branch also carries a stable integer id (``bid``) so that renderers and the ket
printer can follow it across ticks. Ideal gates are permutations and preserve ids.
"""

from __future__ import annotations

from collections.abc import Callable, Iterable, Iterator
from dataclasses import dataclass, replace
from typing import NamedTuple

from .alphabet import EMPTY
from .geometry import Pos


class Walker(NamedTuple):
    """Record of one slot: local state, position and direction.

    For an empty slot the same record is the slot's ghost; ``s`` is then the ghost
    colour.
    """

    s: int
    level: int
    branch: int
    site: int
    dir: int

    @property
    def pos(self) -> Pos:
        return Pos(self.level, self.branch, self.site)


class Stray(NamedTuple):
    """A walker outside the slots of the train (DECISION D21): created by a copy on a
    site that no slot occupies. ``k`` is the time bin it shares (−1 if none)."""

    k: int
    w: Walker


# Physical identity of a branch: present walkers (None for ∅), the set of memory cells
# whose switch F is on (cell_switch copy mode), the stray walkers, whether the branch has
# collided (DECISION D26: frozen, counted as failure), and the environment records of
# walkers that left the system at a cell (D29: slot, lane, tick and the local state it took
# away), which keep branches with different histories orthogonal.
BranchKey = tuple[
    tuple[Walker | None, ...],
    frozenset[int],
    tuple[Stray, ...],
    bool,
    tuple[tuple[int, int, int, int], ...],
]


@dataclass(slots=True)
class Branch:
    amp: complex
    slots: tuple[Walker, ...]
    present: tuple[bool, ...]
    cells_on: frozenset[int] = frozenset()
    bid: int = 0
    strays: tuple[Stray, ...] = ()
    collided: bool = False
    lost: tuple[tuple[int, int, int, int], ...] = ()

    def key(self) -> BranchKey:
        return (
            tuple(w if p else None for w, p in zip(self.slots, self.present, strict=True)),
            self.cells_on,
            self.strays,
            self.collided,
            self.lost,
        )

    def local(self, k: int) -> int:
        """Local state of slot ``k`` as gates see it (``E`` for an empty slot)."""
        return self.slots[k].s if self.present[k] else EMPTY

    def copy_with(
        self,
        *,
        slots: tuple[Walker, ...] | None = None,
        present: tuple[bool, ...] | None = None,
        cells_on: frozenset[int] | None = None,
        amp: complex | None = None,
        strays: tuple[Stray, ...] | None = None,
        collided: bool | None = None,
        lost: tuple[tuple[int, int, int, int], ...] | None = None,
    ) -> Branch:
        return replace(
            self,
            slots=self.slots if slots is None else slots,
            present=self.present if present is None else present,
            cells_on=self.cells_on if cells_on is None else cells_on,
            amp=self.amp if amp is None else amp,
            strays=self.strays if strays is None else tuple(sorted(strays)),
            collided=self.collided if collided is None else collided,
            lost=self.lost if lost is None else lost,
        )


class SparseState:
    """Dictionary ``BranchKey → Branch`` with interference-aware insertion."""

    __slots__ = ("_branches", "next_bid")

    def __init__(self, branches: Iterable[Branch] = (), next_bid: int | None = None) -> None:
        self._branches: dict[BranchKey, Branch] = {}
        for br in branches:
            self.add(br)
        if next_bid is None:
            next_bid = 1 + max((b.bid for b in self._branches.values()), default=-1)
        self.next_bid = next_bid

    def add(self, br: Branch) -> None:
        """Insert a branch, summing amplitudes with an existing branch of equal key."""
        key = br.key()
        old = self._branches.get(key)
        if old is None:
            self._branches[key] = br
            return
        keep = old if abs(old.amp) >= abs(br.amp) else br
        self._branches[key] = keep.copy_with(amp=old.amp + br.amp)

    def map(self, f: Callable[[Branch], Iterable[Branch]]) -> SparseState:
        """Apply a linear map defined on branches; coinciding outputs interfere."""
        out = SparseState(next_bid=self.next_bid)
        for br in self._branches.values():
            for new in f(br):
                out.add(new)
        return out

    def __iter__(self) -> Iterator[Branch]:
        return iter(self._branches.values())

    def __len__(self) -> int:
        return len(self._branches)

    def branches(self) -> list[Branch]:
        """Branches sorted by id (stable order for rendering)."""
        return sorted(self._branches.values(), key=lambda b: b.bid)

    def get(self, key: BranchKey) -> Branch | None:
        return self._branches.get(key)

    def amplitudes(self) -> dict[BranchKey, complex]:
        return {k: b.amp for k, b in self._branches.items()}

    def norm_sq(self) -> float:
        return sum(abs(b.amp) ** 2 for b in self._branches.values())

    def inner(self, other: SparseState) -> complex:
        """``⟨self|other⟩``."""
        total = 0j
        for key, br in self._branches.items():
            o = other._branches.get(key)
            if o is not None:
                total += br.amp.conjugate() * o.amp
        return total

    def prune(self, eps: float = 1e-12) -> float:
        """Drop branches with ``|amp|² < eps``; return the discarded weight."""
        dropped = [k for k, b in self._branches.items() if abs(b.amp) ** 2 < eps]
        weight = sum(abs(self._branches[k].amp) ** 2 for k in dropped)
        for k in dropped:
            del self._branches[k]
        return weight

    def with_directions(self, direction: int) -> SparseState:
        """Copy with every walker and ghost direction set to ``direction``."""

        def flip(br: Branch) -> list[Branch]:
            if br.collided:
                return [br]
            return [
                br.copy_with(
                    slots=tuple(w._replace(dir=direction) for w in br.slots),
                    strays=tuple(Stray(x.k, x.w._replace(dir=direction)) for x in br.strays),
                )
            ]

        return self.map(flip)
