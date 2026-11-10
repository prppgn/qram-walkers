"""Binary-tree geometry: edges, sites, path coordinate, cell/address map (PROTOCOL.md §1.4).

Conventions
-----------
* Level ``d = 1..n``: edge ``(d, l)``, ``l = 1..2^(d-1)``, ends at bifurcation ``(d, l)``,
  whose children are ``(d+1, 2l-1)`` (left, bit 0) and ``(d+1, 2l)`` (right, bit 1).
* Level ``n+1``: memory lane ``(n+1, l)``, ``l = 1..2^n``, entering cell ``l``.
* Level ``0``: the external port line (one branch, sites ``x ≤ 0``). A walker at
  ``(0, 1, x)`` is outside the tree: before injection when moving forward, after exit
  when moving backward. Site ``0`` is adjacent to site 1 of the entry edge ``(1, 1)``.
* Sites of an edge are numbered ``1..n_sites(d)`` in the forward direction.
* Path coordinate ``x``: site ``s`` of level ``d`` has ``x = Σ_{d'<d} n_sites(d') + s``;
  on the port line ``x = s ≤ 0``.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import NamedTuple

PORT_LEVEL = 0


class Pos(NamedTuple):
    """Position of a walker: (level, branch, site)."""

    level: int
    branch: int
    site: int


@dataclass(frozen=True)
class Geometry:
    """Edge lengths of a single tree of depth ``n`` with its memory lanes."""

    n: int
    level_sites: tuple[int, ...]  # n_sites(d) for d = 1..n+1 (index d-1); last = lane

    def __post_init__(self) -> None:
        if self.n < 1:
            raise ValueError("the tree needs at least one level (n >= 1)")
        if len(self.level_sites) != self.n + 1:
            raise ValueError("level_sites must list n_sites(d) for d = 1..n+1")
        if any(s < 1 for s in self.level_sites):
            raise ValueError("every edge needs at least one site")

    @property
    def lane_level(self) -> int:
        """Level index of the memory lanes (``n + 1``)."""
        return self.n + 1

    @property
    def n_cells(self) -> int:
        return 1 << self.n

    def sites(self, d: int) -> int:
        """``n_sites(d)`` for ``d = 1..n+1``."""
        return self.level_sites[d - 1]

    def offset(self, d: int) -> int:
        """``Σ_{d'<d} n_sites(d')``: path coordinate of site 0 of level ``d``."""
        return sum(self.level_sites[: d - 1])

    def X(self, d: int, s: int) -> int:
        """Path coordinate of site ``s`` of level ``d``."""
        if d == PORT_LEVEL:
            return s
        return self.offset(d) + s

    def x_of(self, pos: Pos) -> int:
        return self.X(pos.level, pos.site)

    def locate(self, x: int) -> tuple[int, int]:
        """Level and site of path coordinate ``x`` (level 0 = port line for ``x ≤ 0``;
        beyond the lane end the last lane site is returned)."""
        if x <= 0:
            return PORT_LEVEL, x
        offset = 0
        for d, n_sites in enumerate(self.level_sites, start=1):
            if x <= offset + n_sites:
                return d, x - offset
            offset += n_sites
        return self.lane_level, self.level_sites[-1]

    def n_edges(self, d: int) -> int:
        """Number of edges at level ``d`` (``2^(d-1)``; ``2^n`` lanes at ``d = n+1``)."""
        return 1 << (d - 1)

    def children(self, d: int, l: int) -> tuple[tuple[int, int], tuple[int, int]]:
        """Left and right child edges of bifurcation ``(d, l)``."""
        return (d + 1, 2 * l - 1), (d + 1, 2 * l)

    @property
    def sites_path(self) -> int:
        """Sites along one root-to-cell path, memory lane included."""
        return sum(self.level_sites)

    @property
    def sites_total(self) -> int:
        """Sites in the whole tree, memory lanes included."""
        return sum(self.n_edges(d) * self.sites(d) for d in range(1, self.n + 2))

    def cell_of_address(self, address: str) -> int:
        """Cell index ``l = 1 + Σ a_i 2^(n-i)`` of an address string ``a_1 … a_n``."""
        check_address(address, self.n)
        return 1 + int(address, 2)

    def address_of_cell(self, l: int) -> str:
        """Address string ``a_1 … a_n`` of cell ``l``."""
        if not 1 <= l <= self.n_cells:
            raise ValueError(f"cell index {l} outside 1..{self.n_cells}")
        return format(l - 1, f"0{self.n}b")


def check_address(address: str, n: int) -> None:
    """Raise ``ValueError`` unless ``address`` is an ``n``-bit string."""
    if len(address) != n or any(c not in "01" for c in address):
        raise ValueError(f"address {address!r} is not an {n}-bit string")


def all_addresses(n: int) -> list[str]:
    """All ``2^n`` addresses in cell order."""
    return [format(i, f"0{n}b") for i in range(1 << n)]
