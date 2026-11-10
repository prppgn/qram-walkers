"""Measured depth scalings (PLAN.md Phase 2, DECISION D3).

Runs the engine on a grid of sizes (classical address ``1…1``, frames off, strict),
records the tick counts and fits ``T = c0 + c1·n + c2·m + c3·n² + c4·n·m`` by least
squares. The paper's closed formulas are listed next to the fit: the engine's memory
lane hosts the whole train, so constants differ (D3) while the scaling must agree —
quadratic in ``n`` for the basic variant, linear in ``n`` and ``m`` for the backup one.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import numpy as np

from .api import simulate
from .config import InputTerm, Options, RecordOptions, RunConfig, default_copy_mode

FEATURES = ("1", "n", "m", "n²", "n·m")


@dataclass(frozen=True)
class Sample:
    n: int
    m: int
    K: int
    T_fwd: int
    T_q: int
    T_total: int
    sites_path: int
    fidelity: float


def measure(
    variant: str, ns: range, ms: range, copy_mode: str | None = None, **options: Any
) -> list[Sample]:
    out = []
    for n in ns:
        for m in ms:
            cfg = RunConfig(
                variant=variant,
                n=n,
                m=m,
                copy_mode=copy_mode or default_copy_mode(variant),
                terms=(InputTerm("1" * n, 1 + 0j),),
                memory_fill="ones",
                options=Options(strict=True, **options),
                record=RecordOptions(frames=False),
            )
            r = simulate(cfg)
            res = r.resources
            out.append(
                Sample(
                    n,
                    m,
                    res["K"],
                    res["T_fwd"],
                    res["T_q"],
                    res["T_total"],
                    res["sites_path_tree_only"],
                    r.metrics["fidelity"],
                )
            )
    return out


def fit(samples: list[Sample], key: str = "T_total") -> dict[str, Any]:
    """Least-squares coefficients on (1, n, m, n², n·m) and the largest residual."""
    a = np.array([[1, s.n, s.m, s.n * s.n, s.n * s.m] for s in samples], dtype=float)
    y = np.array([getattr(s, key) for s in samples], dtype=float)
    coef, *_ = np.linalg.lstsq(a, y, rcond=None)
    residual = float(np.max(np.abs(a @ coef - y))) if len(samples) else 0.0
    return {
        "key": key,
        "coefficients": {f: round(float(c), 6) + 0.0 for f, c in zip(FEATURES, coef, strict=True)},
        "max_residual": residual,
    }


def formula(coefficients: dict[str, float], tol: float = 1e-6) -> str:
    """Human-readable fitted polynomial, e.g. ``n² + 2n·m + 5n + 3m + 2``."""
    order = ("n²", "n·m", "n", "m", "1")
    terms = []
    for f in order:
        c = coefficients[f]
        if abs(c) < tol:
            continue
        num = f"{c:.4g}"
        if f == "1":
            terms.append(num)
        elif abs(c - 1) < tol:
            terms.append(f)
        else:
            terms.append(f"{num}{f}")
    return " + ".join(terms).replace("+ -", "− ") or "0"


PAPER_DEPTH = {
    "basic": "T_serial ~ O(n(n + m)); comparison table: n²/2 + nm + O(n + m)",
    "backup": "T_backup = 10n + 4m + t_Q (routing alone: 6n + 2m)",
    "qudit_short": "T_parallel = 5n + 2m",
    "qudit_long": "T_serial ~ O(n(n + m)); comparison table: n²/2 + nm + O(n + m)",
    "dualrail_basic": "T_serial = T_prep + T_rout = (n² + 2nm + n + 2m)/2",
    "dualrail_backup": "T_parallel = T_prep + T_rout = 3(n + m) + 10n + 4m = 13n + 7m",
}
