"""Strict-mode invariants (PROTOCOL.md §8.2) hold in ideal runs and catch violations."""

from __future__ import annotations

from dataclasses import replace

import numpy as np
import pytest

from qramsim import InputTerm, Options, simulate
from qramsim.alphabet import BLUE
from qramsim.config import RunConfig
from qramsim.simulator import InvariantViolation, Simulator
from qramsim.variants import REGISTRY, BasicVariant

from helpers import config, random_superposition


def test_strict_ideal_runs_pass() -> None:
    rng = np.random.default_rng(3)
    for n in (1, 2, 3, 4, 5):
        for mode in ("global", "cell_switch"):
            cfg = config(n, 2, random_superposition(n, rng), copy_mode=mode, strict=True)
            assert simulate(cfg).metrics["fidelity"] > 1 - 1e-12


class BlueDataVariant(BasicVariant):
    """Injects D_1 blue: it would reach Û⁽¹⁾ blue (forbidden)."""

    name = "basic_blue_test"

    def encode(self, address: str) -> tuple[int, ...]:
        states = list(super().encode(address))
        states[self.n + 1] = BLUE
        return tuple(states)


@pytest.fixture
def blue_variant():  # type: ignore[no-untyped-def]
    REGISTRY[BlueDataVariant.name] = BlueDataVariant
    yield BlueDataVariant.name
    del REGISTRY[BlueDataVariant.name]


def test_blue_walker_before_gate_is_caught(blue_variant: str) -> None:
    base = config(2, 1, (InputTerm("10", 1),), strict=True)
    cfg = replace(base, variant=blue_variant)
    import qramsim.config as config_module

    old = config_module.VARIANTS
    config_module.VARIANTS = (*old, blue_variant)
    config_module.COPY_MODES[blue_variant] = ("global",)
    try:
        with pytest.raises(InvariantViolation, match="not red"):
            Simulator(cfg).run()
        # without strict mode the run completes but Eq. (1) fails
        loose = replace(cfg, options=Options(strict=False))
        assert simulate(loose).metrics["fidelity"] < 0.5
    finally:
        config_module.VARIANTS = old
        del config_module.COPY_MODES[blue_variant]


def test_short_window_misroutes_data() -> None:
    """A Û⁽¹⁾ window shorter than the train misses D_1 and D_2: they go left, D_0 right.

    The copy then meets an empty D_j site next to a red D_0: Eq. locCopy creates a walker
    there, a stray in the time bin of D_j (DECISION D21), and the output is wrong.
    """
    cfg = config(2, 2, (InputTerm("10", 1),), strict=False, frames=True)
    cfg = replace(cfg, memory=((0, 0),) * 4, options=Options(n_sites={"1": 3}))
    assert Simulator(cfg).variant.warnings
    result = simulate(cfg)
    kinds = {e["kind"] for _, e in result.trajectory.events()}
    assert "stray" in kinds and "collision" in kinds  # the stray meets D_j on the way back
    assert result.metrics["success"] == 0.0 and result.metrics["collided"] == 1.0


def test_switches_off_after_query() -> None:
    cfg: RunConfig = config(
        3, 2, (InputTerm("011", 1), InputTerm("110", 1j)), copy_mode="cell_switch"
    )
    sim = Simulator(cfg)
    sim.run()  # strict: _check_switches_off ran at the end of the query
    assert sim.schedule.query[-1].id == "cell_off"
