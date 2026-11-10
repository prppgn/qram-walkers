"""Gate tables (PROTOCOL.md §3): bijectivity, adjoint relations, paper entries."""

from __future__ import annotations

import itertools

import numpy as np
import pytest

from qramsim.alphabet import BLUE, EMPTY, RED, Family, alphabet, colour_not
from qramsim.gates import (
    LOC_COPY,
    S_DAG_TABLE,
    S_TABLE,
    X_TABLE,
    GateKind,
    Port,
    controlled_window_table,
    copy_cell_window_table,
    loc_copy_table,
    switch_window_table,
)

E, R, B = EMPTY, RED, BLUE


def is_involutive_permutation(table: dict) -> bool:  # type: ignore[type-arg]
    values = list(table.values())
    bijective = len(set(values)) == len(values) and set(values) == set(table)
    return bijective and all(table[table[k]] == k for k in table)


def test_colour_not_on_every_alphabet() -> None:
    assert X_TABLE == {E: E, R: B, B: R}
    for fam in Family:
        for s in alphabet(fam):
            assert colour_not(fam, colour_not(fam, s)) == s
            if not (fam is Family.BOSONIC and s == E):
                assert colour_not(fam, s) != s


@pytest.mark.parametrize("k", range(0, 6))
def test_address_transmission_table(k: int) -> None:
    table = controlled_window_table(GateKind.U, k)
    assert len(table) == 3 ** (k + 1)
    assert is_involutive_permutation(table)  # unitary and self-adjoint
    for (ctrl, *targets), (ctrl2, *new) in table.items():
        assert ctrl2 == ctrl  # the control is never touched
        if ctrl == R:  # V_R = ⊗ X  (technical paper, Eq. (targetOp))
            assert new == [X_TABLE[t] for t in targets]
        else:  # V_B = V_∅ = I
            assert new == targets


def test_local_copy_table_eq_loccopy() -> None:
    table = loc_copy_table()
    assert is_involutive_permutation(table)
    # |R⟩_D |R⟩_M → |R⟩_D |R⟩_M  and  |R⟩_D |∅⟩_M → |∅⟩_D |∅⟩_M
    # (technical paper, Eq. (copyMapping))
    assert table[(R, R)] == (R, R)
    assert table[(E, R)] == (E, E)
    assert table[(E, E)] == (E, R)
    assert table[(E, B)] == (E, B)
    for mem in (R, B):
        for d in (E, R, B):
            assert table[(mem, d)] == (mem, d)
    assert LOC_COPY[0] == {E: R, R: E, B: B}
    assert LOC_COPY[1] == {E: E, R: R, B: B}


@pytest.mark.parametrize(
    "bits", [b for m in (1, 2, 3) for b in itertools.product((0, 1), repeat=m)]
)
def test_global_copy_table(bits: tuple[int, ...]) -> None:
    table = controlled_window_table(GateKind.COPY_GLOBAL, len(bits), bits)
    assert is_involutive_permutation(table)
    for (ctrl, *data), (_, *new) in table.items():
        if ctrl == R:
            assert new == [LOC_COPY[b][d] for b, d in zip(bits, data, strict=True)]
        else:
            assert new == data


def test_switch_tables() -> None:
    for kind in (GateKind.CELL_ON, GateKind.CELL_OFF):
        table = switch_window_table(kind)
        assert is_involutive_permutation(table)
        assert table[(R, False)] == (R, True)
        assert table[(R, True)] == (R, False)
        for c in (E, B):
            for f in (False, True):
                assert table[(c, f)] == (c, f)


@pytest.mark.parametrize("bits", [(0,), (1,), (0, 1), (1, 0, 1)])
def test_copy_cell_table(bits: tuple[int, ...]) -> None:
    table = copy_cell_window_table(bits)
    assert is_involutive_permutation(table)
    for (f, data), (f2, new) in table.items():
        assert f2 == f
        assert new == (
            tuple(LOC_COPY[b][d] for b, d in zip(bits, data, strict=True)) if f else data
        )


def test_scattering_forward_rows() -> None:
    """Technical paper, Eq. (bosonicS): red → left keeping red; blue → right reset to red."""
    assert S_TABLE[(R, Port.PARENT)] == (R, Port.LEFT)
    assert S_TABLE[(B, Port.PARENT)] == (R, Port.RIGHT)


def test_scattering_inverse_rows() -> None:
    """PROTOCOL.md §3.3."""
    assert S_DAG_TABLE[(R, Port.LEFT)] == (R, Port.PARENT)
    assert S_DAG_TABLE[(R, Port.RIGHT)] == (B, Port.PARENT)
    assert S_DAG_TABLE[(B, Port.LEFT)] == (R, Port.RIGHT)
    assert S_DAG_TABLE[(B, Port.RIGHT)] == (R, Port.LEFT)


def test_scattering_is_unitary() -> None:
    """Ŝ on the three-port single-particle space ⊕ vacuum: a permutation with Ŝ†Ŝ = I."""
    basis = [(c, p) for c in (R, B) for p in Port]
    assert set(S_TABLE) == set(basis) == set(S_TABLE.values())
    index = {b: i for i, b in enumerate(basis)}
    dim = len(basis) + 1  # + vacuum, mapped to itself
    S = np.zeros((dim, dim))
    for src, dst in S_TABLE.items():
        S[index[dst], index[src]] = 1
    S[-1, -1] = 1
    Sd = np.zeros((dim, dim))
    for src, dst in S_DAG_TABLE.items():
        Sd[index[dst], index[src]] = 1
    Sd[-1, -1] = 1
    assert np.array_equal(S.T, Sd)  # S† is the adjoint
    assert np.array_equal(Sd @ S, np.eye(dim))
    assert np.array_equal(S @ Sd, np.eye(dim))
