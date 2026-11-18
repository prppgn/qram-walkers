"""The technical narration (``text``) states what the engine saw, also under noise.

In the ideal protocol the scheduled control of a gate is the walker on its control site, a
copy finds its data walker where it expects it, and every branch runs. Noise breaks each of
these: a jittered clock puts another walker on the control site, a lost or scattered data
walker leaves its site empty, a collision freezes a branch, a gate failure stops a gate. The
sentences must then describe the run, not the ideal protocol.
"""

from __future__ import annotations

from typing import Any

import pytest

from qramsim import InputTerm, RunConfig, simulate
from qramsim.config import Options, input_terms
from qramsim.presets import get_preset

Events = list[tuple[int, dict[str, Any]]]


def events(cfg: RunConfig) -> Events:
    return simulate(cfg).trajectory.events()


def texts(name: str) -> list[str]:
    return [e["text"] for _, e in events(get_preset(name).config)]


def test_dualrail_backup_names_the_backup_that_controls() -> None:
    """Û_B of the dual-rail backup is controlled by Ã↑ or Ã↓; the schedule names the ↓ one."""
    t = texts("dualrail-backup")
    assert "Û_B⁽²⁾ [Ã₂↑, Ã₂↓] on the 2 edges of level 2: Ã₂↑ is blue → X̂ flips D̃₁↑." in t
    assert "Û_B⁽¹⁾ [Ã₂↑, Ã₂↓] on edge (1,1): Ã₂↓ is blue → X̂ flips D₁, D̃₁↓." in t
    # with both addresses, the gate is controlled by either backup
    cfg = RunConfig(
        variant="dualrail_backup", n=2, m=1, copy_mode="backup", terms=input_terms("ghz", 2)
    )
    assert any("Ã₂↑ or Ã₂↓ is blue (in every branch)" in e["text"] for _, e in events(cfg))


def test_copy_text_follows_what_the_copy_found() -> None:
    stray = texts("noise-stray")
    assert (
        "Û_copy⁽ᵃ⁾ [D₁] acts in the lane(s) where D₀ is red: the local copy finds the site of "
        "D₁ empty in 1 branch(es): b = 0 maps |∅⟩ → |R⟩, a new walker." in stray
    )
    for name in ("noise-loss", "noise-scatter"):
        assert (
            "Û_copy⁽ᵃ⁾ [D₁] acts in the lane(s) where D₀ is red: the local copy finds the site "
            "of D₁ empty (∅) in 1 branch(es): nothing to act on." in texts(name)
        )
    # the ideal sentences are unchanged
    assert (
        "Û_copy⁽ᵃ⁾ [D₁] acts in the lane(s) where D₀ is red: the local copy leaves the data "
        "walkers red (stored bits = 1)." in texts("E1")
    )
    assert any("the local copy erases D₁ in 1 branch(es)" in t for t in texts("E1b"))


def test_a_copy_error_is_not_called_a_stored_bit() -> None:
    """A copy error makes the copy read 1 where 0 is stored: no 'stored bits = 1'."""
    cfg = RunConfig(
        n=1,
        m=1,
        terms=(InputTerm("1", 1),),
        memory=((0,), (0,)),
        noise=({"model": "copy_error", "p": 1.0},),
    )
    copy = [e["text"] for _, e in events(cfg) if e["kind"] == "gate" and "copy" in e["type"]]
    assert copy and all("stored bits = 1" not in t for t in copy)
    assert any("leaves the data walkers red (bits read = 1)" in t for t in copy)


def test_frozen_branches_are_not_an_absent_control() -> None:
    t = texts("noise-scatter")
    assert (
        "Û⁽¹⁾ (inverse routing; self-adjoint): its branch is frozen by a collision → identity." in t
    )
    assert not any("A₁ is absent" in x for x in t)


def test_a_failed_gate_says_so() -> None:
    cfg = RunConfig(
        n=2, m=1, terms=(InputTerm("10", 1),), noise=({"model": "gate_failure", "p": 1.0},), seed=0
    )
    t = [e["text"] for _, e in events(cfg)]
    assert "Û⁽¹⁾: a gate failure stopped it on 1 edge(s) → identity everywhere." in t
    assert (
        "Û_copy⁽ᵃ⁾ [D₁]: a gate failure stopped it on 1 memory lane(s) → identity everywhere." in t
    )
    assert not any("A₁ is absent" in x or "where D₀ is red" in x for x in t)


def test_clock_jitter_names_the_walker_on_the_control_site() -> None:
    """The plain and the technical sentence name the same walker on the control site."""
    found = 0
    for seed in range(12):
        cfg = RunConfig(
            n=2,
            m=1,
            terms=input_terms("ghz", 2),
            noise=({"model": "clock_jitter", "p_early": 0.2, "p_late": 0.2},),
            seed=seed,
        )
        for _, e in events(cfg):
            plain = e.get("text_plain", "")
            if e["kind"] != "gate" or "'s place (" not in plain:
                continue
            place, who = plain.split("the walker in ", 1)[1].split("'s place (", 1)
            who = who.split(")", 1)[0]
            assert f"{who} (on the control site of {place})" in e["text"], e["text"]
            found += 1
    assert found


def test_pruning_counts_the_branches_it_drops() -> None:
    prunes = [e for _, e in events(get_preset("coherent-demo").config) if e.get("model") == "prune"]
    assert prunes
    for e in prunes:
        assert e["count"] > 0
        assert e["text"].startswith(f"Pruning: {e['count']} branch(es) below |α|² = ")
    capped = RunConfig(
        n=2,
        m=1,
        terms=input_terms("uniform", 2),
        noise=({"model": "overrotation", "epsilon": 0.2},),
        options=Options(max_branches=4),
    )
    texts_capped = [e["text"] for _, e in events(capped) if e.get("model") == "prune"]
    assert any("beyond the 4 largest (max_branches)" in t for t in texts_capped)


NOISES: list[tuple[dict[str, Any], ...]] = [
    ({"model": "loss", "p": 0.2},),
    ({"model": "scatter_flip", "p": 0.2},),
    ({"model": "depolarizing", "p": 0.3},),
    ({"model": "gate_failure", "p": 0.3},),
    ({"model": "clock_jitter", "p_early": 0.1, "p_late": 0.1},),
]
VARIANTS = [
    ("basic", "global"),
    ("basic", "cell_switch"),
    ("backup", "backup"),
    ("qudit_short", "global"),
    ("dualrail_basic", "global"),
    ("dualrail_backup", "backup"),
]
IDEAL_ONLY = ("absent (∅)", "red or absent", "not in an activating state")


@pytest.mark.parametrize(("variant", "mode"), VARIANTS)
@pytest.mark.parametrize("noise", NOISES, ids=lambda n: n[0]["model"])
def test_noisy_runs_do_not_explain_by_the_ideal_protocol(
    variant: str, mode: str, noise: tuple[dict[str, Any], ...]
) -> None:
    """After noise has acted, no sentence names an idle control by the ideal protocol; a gate
    that a failure stopped says so."""
    for seed in (0, 1):
        cfg = RunConfig(
            variant=variant,
            n=2,
            m=2,
            copy_mode=mode,
            terms=input_terms("ghz", 2),
            memory_fill="random",
            memory_seed=seed,
            noise=noise,
            seed=seed,
        )
        evs = events(cfg)
        failures = {(t, e["gate"]) for t, e in evs if e.get("model") == "gate_failure"}
        disturbed = noise[0]["model"] == "clock_jitter"
        for t, e in evs:
            if e["kind"] in ("noise", "stray", "collision"):
                disturbed = True
            if e["kind"] != "gate":
                continue
            if disturbed:
                assert not any(s in e["text"] for s in IDEAL_ONLY), e["text"]
            if (t, e["gate"]) in failures and not e["fired_in"]:
                assert "a gate failure stopped it" in e["text"], e["text"]
