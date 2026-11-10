"""Correctness gate: Eq. (1) for the basic variant (PROTOCOL.md §8.1).

For n ≤ 4, m ≤ 3 and both copy modes: every classical address with random memories and
at least 50 random superpositions (random support, random complex amplitudes) must give
fidelity 1 − 1e−12 with Σ_a α_a |a⟩_A |b^(a)⟩_D, every walker exited through the port in
slot order, no duplicate physical branches and norm 1. Runs are strict (invariants of
PROTOCOL.md §8.2 asserted at every tick).
"""

from __future__ import annotations

import cmath

import numpy as np
import pytest
from hypothesis import given, settings
from hypothesis import strategies as st

from qramsim import InputTerm, simulate
from qramsim.geometry import PORT_LEVEL, all_addresses

from helpers import config, random_superposition

TOL = 1e-12
MODES = ["global", "cell_switch"]


def check_output(cfg):  # type: ignore[no-untyped-def]
    result = simulate(cfg)
    final = result.final
    n_terms = len(result.config.terms)
    assert result.metrics["fidelity"] >= 1 - TOL
    assert abs(result.metrics["norm"] - 1) < TOL
    assert result.metrics["success"] >= 1 - TOL
    assert result.metrics["consistency"] >= 1 - TOL
    # one output branch per input term: ghost-free keys, no spurious splitting
    assert len(final) == n_terms
    for br in final:
        for k, (w, present) in enumerate(zip(br.slots, br.present, strict=True)):
            # every slot (walker or ghost) left through the port, in slot order
            assert (w.level, w.site, w.dir) == (PORT_LEVEL, -k, -1)
            if present:
                assert w.s == 1  # red
        assert not br.cells_on
        readout = result.variant.readout(br)
        assert readout.well_formed
        assert readout.data == result.variant.stored(readout.address)
    return result


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("m", [1, 2, 3])
@pytest.mark.parametrize("n", [1, 2, 3, 4])
def test_classical_addresses(n: int, m: int, mode: str) -> None:
    for memory_seed in range(2):
        for address in all_addresses(n):
            cfg = config(
                n, m, (InputTerm(address, 1 + 0j),), copy_mode=mode, memory_seed=memory_seed
            )
            check_output(cfg)


@pytest.mark.parametrize("mode", MODES)
@pytest.mark.parametrize("n", [1, 2, 3, 4])
def test_random_superpositions(n: int, mode: str) -> None:
    rng = np.random.default_rng(1000 * n + (mode == "cell_switch"))
    for i in range(50):
        m = int(rng.integers(1, 4))
        terms = random_superposition(n, rng)
        cfg = config(n, m, terms, copy_mode=mode, memory_seed=i)
        result = check_output(cfg)
        # amplitudes are carried exactly (permutation dynamics)
        amps = {t.address: t.amp for t in result.config.terms}
        for br in result.final:
            assert br.amp == amps[result.variant.readout(br).address]


@pytest.mark.parametrize("mode", MODES)
def test_unstaggered_query(mode: str) -> None:
    rng = np.random.default_rng(7)
    for i in range(10):
        terms = random_superposition(3, rng)
        check_output(config(3, 3, terms, copy_mode=mode, memory_seed=i, stagger=False))


@settings(max_examples=60, deadline=None)
@given(
    n=st.integers(1, 3),
    m=st.integers(1, 3),
    mode=st.sampled_from(MODES),
    data=st.data(),
)
def test_hypothesis_superpositions(n: int, m: int, mode: str, data: st.DataObject) -> None:
    support = data.draw(
        st.lists(st.sampled_from(all_addresses(n)), min_size=1, max_size=1 << n, unique=True)
    )
    terms = tuple(
        InputTerm(
            a,
            cmath.rect(
                data.draw(st.floats(0.05, 1.0)), data.draw(st.floats(0.0, 6.283185307179586))
            ),
        )
        for a in support
    )
    memory_seed = data.draw(st.integers(0, 10_000))
    check_output(config(n, m, terms, copy_mode=mode, memory_seed=memory_seed))


def test_ideal_output_matches_paper_e2() -> None:
    """E2 output: (|R⟩_D1|∅⟩_A2|∅⟩_A1 + |∅⟩_D1|R⟩_A2|R⟩_A1)/√2, D_0 red."""
    from qramsim.presets import get_preset

    result = simulate(get_preset("E2").config)
    assert result.metrics["fidelity"] >= 1 - TOL
    outputs = {
        result.variant.readout(b).address: (b.present, b.amp) for b in result.final.branches()
    }
    # slots front→tail: A_1, A_2, D_0, D_1
    assert outputs["00"][0] == (False, False, True, True)
    assert outputs["11"][0] == (True, True, True, False)
    for _, amp in outputs.values():
        assert abs(amp - 2**-0.5) < TOL
