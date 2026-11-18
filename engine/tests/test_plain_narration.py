"""The plain register of the narration: every event carries ``text_plain``.

The plain sentence states the same facts as the technical ``text`` in simpler words, for
readers who know qubits but have not read the paper: no coordinates, no slots, sites, lanes
or clock ticks, no operator algebra.
"""

from __future__ import annotations

import json
import re
from typing import Any

import pytest

from qramsim import InputTerm, RunConfig, simulate
from qramsim.config import input_terms
from qramsim.presets import PRESETS, get_preset
from qramsim.trajectory import Trajectory, validate

# Coordinates such as (1,1) or (2,·); the jargon of the technical register. "X̂_c" is the
# name of a gate drawn on screen (the dual-rail output circuit) and stays.
BANNED = re.compile(
    r"\(\d+,[\d·]+\)|\b(?:slot|site|lane|tick)s?\b|self-adjoint|identity|X̂(?!_c)|K ="
)


def events(cfg: RunConfig) -> list[tuple[int, dict[str, Any]]]:
    return simulate(cfg).trajectory.events()


def check(evs: list[tuple[int, dict[str, Any]]]) -> None:
    assert evs
    for t, e in evs:
        plain = e.get("text_plain")
        assert isinstance(plain, str) and plain.strip(), (t, e["kind"], e["text"])
        assert not BANNED.search(plain), (t, e["kind"], plain)
        if e["kind"] in ("gate", "scatter"):
            assert plain != e["text"], (t, plain)


@pytest.mark.parametrize("name", list(PRESETS))
def test_every_preset_event_has_a_plain_sentence(name: str) -> None:
    check(events(PRESETS[name].config))


NOISES: list[tuple[dict[str, Any], ...]] = [
    ({"model": "loss", "p": 0.1},),
    ({"model": "loss", "p": 0.3, "where": ["idle"]},),
    ({"model": "bit_flip", "p": 0.2},),
    ({"model": "scatter_flip", "p": 0.2},),
    ({"model": "colour_dephasing", "p": 0.2},),
    ({"model": "logical_dephasing", "p": 0.2},),
    ({"model": "depolarizing", "p": 0.3},),
    ({"model": "gate_failure", "p": 0.3},),
    ({"model": "copy_error", "p": 0.5},),
    ({"model": "memory_bit_flip", "p": 0.3},),
    ({"model": "clock_jitter", "p_early": 0.1, "p_late": 0.1},),
    ({"model": "overrotation", "epsilon": 0.1}, {"model": "beam_splitter_imbalance", "eta": 0.1}),
]
VARIANTS = [
    ("basic", "global"),
    ("basic", "cell_switch"),
    ("backup", "backup"),
    ("qudit_short", "global"),
    ("qudit_long", "cell_switch"),
    ("dualrail_basic", "global"),
    ("dualrail_backup", "backup"),
]


@pytest.mark.parametrize(("variant", "mode"), VARIANTS)
@pytest.mark.parametrize("noise", NOISES, ids=lambda n: "+".join(e["model"] for e in n))
def test_generated_noisy_runs_have_plain_sentences(
    variant: str, mode: str, noise: tuple[dict[str, Any], ...]
) -> None:
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
        check(events(cfg))


def test_variant_specific_noise_models() -> None:
    bosonic = ({"model": "presence_dephasing", "p": 0.3},)
    check(events(RunConfig(n=2, m=1, terms=input_terms("uniform", 2), noise=bosonic, seed=2)))
    for variant in ("qudit_long", "dualrail_basic"):
        for noise in (
            ({"model": "logical_flip", "p": 0.3},),
            ({"model": "depolarizing", "p": 0.3, "on": "both"},),
        ):
            cfg = RunConfig(
                variant=variant, n=2, m=1, terms=input_terms("ghz", 2), noise=noise, seed=3
            )
            check(events(cfg))


def plain(name: str) -> list[str]:
    return [e["text_plain"] for _, e in events(get_preset(name).config)]


def test_worked_example_E1_reads_as_intended() -> None:
    texts = plain("E1")
    assert "A₁ enters the tree." in texts
    assert (
        "Û⁽¹⁾ acts: A₁ is red (address bit 1), so D₀ and D₁ turn blue and will take the right "
        "branch." in texts
    )
    assert "Ŝ sends A₁, red, into the left branch (bit 0)." in texts
    assert "Ŝ sends D₀, blue, into the right branch (bit 1) and turns it red again." in texts
    assert (
        "Û⁽²⁾ does nothing: A₂ is absent (address bit 0), so the walkers behind it stay red and "
        "will take the left branch." in texts
    )
    assert "The copy reads cell 10: its bit is 1, so D₁ stays red." in texts
    assert any(
        t.startswith("On the way back Ŝ† merges D₁") and "turning it blue" in t for t in texts
    )
    assert texts[-1].startswith("Done: every walker is back out of the tree")


def test_copy_sentences_follow_the_stored_bit() -> None:
    assert "The copy reads cell 10: its bit is 0, so D₁ is removed." in plain("E1b")
    e2 = plain("E2")
    assert any("cell 00 holds 1, so D₁ stays red" in t and "cell 11 holds 0" in t for t in e2)
    qudit = plain("qudit-long")
    assert any("flips from ● (1) to ○ (0)" in t for t in qudit)
    dual = plain("dualrail")
    assert any("D₁ turns blue" in t for t in dual)
    assert any(t.startswith("In branch |11⟩, Ŝ_M moves D₁") for t in dual)


def test_noise_sentences_say_what_went_wrong() -> None:
    loss = plain("noise-loss")
    assert any(t.startswith("Noise: D₁, blue, is lost at a bifurcation") for t in loss)
    # after the loss the copy finds no walker: no ideal-protocol explanation any more
    assert "The copy reads cell 10: its bit is 1, but D₁ is not there, so nothing happens." in loss
    assert "Û⁽²⁾ does nothing: no red walker is in A₂'s place." in loss
    assert loss[-1] == "Done: the run is over and the output state is read."
    scatter = plain("noise-scatter")
    assert any("takes the wrong branch" in t for t in scatter)
    assert any("Ŝ† bounces it into the sibling branch" in t for t in scatter)
    assert any(t.startswith("Collision: D₀ and D₁") for t in scatter)
    assert any("stopped by a collision" in t for t in scatter)
    stray = plain("noise-stray")
    assert any("a new red walker appears" in t for t in stray)
    assert any(t.startswith("Spurious walker:") for t in stray)
    coherent = plain("coherent-demo")
    assert any(t.startswith("Coherent error: Û⁽¹⁾ over-rotates") for t in coherent)
    assert any(t.startswith("Coherent error: unbalanced bifurcations") for t in coherent)
    assert any(t.startswith("Pruning:") for t in coherent)


def test_gate_sentences_follow_what_the_engine_saw() -> None:
    """A failed gate says so; a dual-rail Û_B names the backup that is actually there."""
    cfg = RunConfig(
        n=2,
        m=1,
        terms=(InputTerm("10", 1),),
        noise=({"model": "gate_failure", "p": 1.0},),
        seed=0,
    )
    texts = [e["text_plain"] for _, e in events(cfg)]
    assert "Û⁽¹⁾ does nothing: it failed to fire." in texts
    assert "The copy does nothing: it failed to fire." in texts
    assert "On the way back Û⁽¹⁾ does nothing: it failed to fire." in texts
    dual = plain("dualrail-backup")
    assert (
        "Û_B⁽²⁾ [Ã₂↑, Ã₂↓] passes the bit down the train: Ã₂↑ is blue, so D̃₁↑ turns blue." in dual
    )


def test_a_run_without_noise_events_keeps_the_explanations() -> None:
    """Noise channels that never fire leave every branch as in the ideal run."""
    texts = plain("noise-demo")
    assert any("(address bit 0)" in t for t in texts)
    assert texts[-1].startswith("Done: every walker is back out of the tree")


def test_trajectories_without_plain_text_still_validate() -> None:
    cfg = RunConfig(n=1, m=1, terms=(InputTerm("1", 1),))
    data = json.loads(simulate(cfg).trajectory.to_json())
    assert validate(data) == []
    for frame in data["frames"]:
        for event in frame["events"]:
            del event["text_plain"]
    assert validate(data) == []
    assert Trajectory.from_dict(data).frames
