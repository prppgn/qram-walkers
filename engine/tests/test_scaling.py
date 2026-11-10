"""Measured depth scalings (PLAN.md Phase 2): quadratic in n for basic, linear for backup.

The fits run the engine (strict, classical address 1…1) on n = 2..8, m = 1..4. The
memory lane hosts the whole train (DECISION D3), so constants differ from the paper's
pass-through cell; the leading terms and the path extents are compared with the technical
paper.
"""

from __future__ import annotations

import pytest

from qramsim.scaling import fit, formula, measure


@pytest.fixture(scope="module")
def basic():  # type: ignore[no-untyped-def]
    return measure("basic", range(2, 9), range(1, 5))


@pytest.fixture(scope="module")
def backup():  # type: ignore[no-untyped-def]
    return measure("backup", range(2, 9), range(1, 5))


def coeffs(samples, key):  # type: ignore[no-untyped-def]
    f = fit(samples, key)
    assert f["max_residual"] < 1e-9  # the engine's counts are exact polynomials
    return f["coefficients"]


def test_all_runs_exact(basic, backup) -> None:  # type: ignore[no-untyped-def]
    assert all(s.fidelity > 1 - 1e-12 for s in basic + backup)


def test_basic_is_quadratic_in_n(basic) -> None:  # type: ignore[no-untyped-def]
    c = coeffs(basic, "T_fwd")
    # T_fwd = Σ_d (K − d + 1) + K with K = n + m + 1: leading n²/2 + nm, as in the comparison
    # table of the technical paper
    assert c == {"1": 1.0, "n": 2.5, "m": 1.0, "n²": 0.5, "n·m": 1.0}
    assert formula(coeffs(basic, "T_total")) == "n² + 2n·m + 5n + 3m + 2"
    # path extent: paper Σ_d (n + m − d) = n²/2 + nm − n/2; engine K − d + 1 adds 2 per level
    assert coeffs(basic, "sites_path") == {"1": 0.0, "n": 1.5, "m": 0.0, "n²": 0.5, "n·m": 1.0}


def test_backup_is_linear(backup) -> None:  # type: ignore[no-untyped-def]
    c = coeffs(backup, "T_fwd")
    assert c["n²"] == 0 and c["n·m"] == 0
    # routing time equals the paper's T_parallel = 6n + 2m (K = 2(n + m))
    assert formula(c) == "6n + 2m"
    # round trip in the lane model: 2(4n + K) + T_q with T_q = m (staggered copies)
    assert formula(coeffs(backup, "T_total")) == "12n + 5m"
    assert formula(coeffs(backup, "sites_path")) == "4n"  # paper: n_sites^tot = 4n


def test_backup_without_last_backup() -> None:
    samples = measure("backup", range(2, 6), range(1, 4), include_last_backup=False)
    assert formula(fit(samples, "T_fwd")["coefficients"]) == "6n + 2m − 1"
