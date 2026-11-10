"""Output metrics (DESIGN.md §7.5, PLAN.md Phase 0).

* ``fidelity``: ``|⟨ψ_ideal|ψ_out⟩|²`` with ``ψ_ideal = Σ_a α_a |a⟩_A |b^(a)⟩_D`` (Eq. 1),
  every walker exited through the port.
* ``success``: probability that the output branch is well formed (every walker exited
  in its slot position, red; flag walkers present; cell switches off).
* ``consistency``: probability that a well-formed output carries the stored data of
  its address, ``b = b^(a)``, conditioned on success.
* ``entropy_AD``: entanglement entropy (bits) of the address register ``A`` with the
  rest (data register and cell switches), from the Schmidt coefficients of the pure
  state. For the ideal output this is the Shannon entropy of the distribution of the
  retrieved data ``b^(a)``.
"""

from __future__ import annotations

import math
from typing import TYPE_CHECKING, Any

import numpy as np

from .state import SparseState, Walker
from .train import Slot

if TYPE_CHECKING:
    from .variants import Variant


def fidelity(final: SparseState, ideal: SparseState) -> float:
    """``|⟨ψ_ideal|ψ_out⟩|²``; weight discarded by pruning is not renormalised (D30)."""
    norm = ideal.norm_sq()
    if norm == 0:
        return 0.0
    return abs(ideal.inner(final)) ** 2 / norm


def success(final: SparseState, variant: Variant) -> float:
    return float(sum(abs(b.amp) ** 2 for b in final if variant.readout(b).well_formed))


def consistency(final: SparseState, variant: Variant) -> float:
    ok = 0.0
    total = 0.0
    for br in final:
        r = variant.readout(br)
        if not r.well_formed:
            continue
        p = abs(br.amp) ** 2
        total += p
        if r.data == variant.stored(r.address):
            ok += p
    return ok / total if total > 0 else 0.0


def entropy_AD(state: SparseState, slots: tuple[Slot, ...]) -> float:
    a_idx = [s.index for s in slots if s.register == "A"]
    rows: dict[tuple[Walker | None, ...], int] = {}
    cols: dict[tuple[Any, ...], int] = {}
    entries: list[tuple[int, int, complex]] = []
    for br in state:
        walkers, cells, strays, collided, lost = br.key()
        a_part = tuple(walkers[k] for k in a_idx)
        rest = (
            tuple(w for k, w in enumerate(walkers) if k not in a_idx),
            cells,
            strays,
            collided,
            lost,
        )
        r = rows.setdefault(a_part, len(rows))
        c = cols.setdefault(rest, len(cols))
        entries.append((r, c, br.amp))
    if not entries:
        return 0.0
    mat = np.zeros((len(rows), len(cols)), dtype=complex)
    for r, c, amp in entries:
        mat[r, c] += amp
    sv = np.linalg.svd(mat, compute_uv=False)
    p = sv**2
    p = p / p.sum()
    return float(-sum(x * math.log2(x) for x in p if x > 1e-15)) + 0.0


def collided(final: SparseState) -> float:
    """Weight of the branches frozen by a collision of two walkers (DECISION D26)."""
    return float(sum(abs(b.amp) ** 2 for b in final if b.collided))


def all_metrics(final: SparseState, ideal: SparseState, variant: Variant) -> dict[str, float]:
    return {
        "fidelity": fidelity(final, ideal),
        "success": success(final, variant),
        "consistency": consistency(final, variant),
        "entropy_AD": entropy_AD(final, variant.slots),
        "norm": final.norm_sq(),
        "collided": collided(final),
    }
