"""Named run configurations: the paper's worked examples and demo scenarios.

E1 and E2 are the examples of the arXiv appendix (PROTOCOL.md §6), with the flag
walker ``D_0`` included (the appendix adds it before the query).
"""

from __future__ import annotations

import math
from dataclasses import dataclass, replace

from .config import InputTerm, Options, RunConfig, input_terms


@dataclass(frozen=True)
class Preset:
    name: str
    title: str
    description: str
    config: RunConfig


_S = 1 / math.sqrt(2)


def _presets() -> dict[str, Preset]:
    e1 = RunConfig(
        variant="basic",
        n=2,
        m=1,
        copy_mode="global",
        terms=(InputTerm("10", 1 + 0j),),
        memory=((0,), (0,), (1,), (0,)),
    )
    e2 = RunConfig(
        variant="basic",
        n=2,
        m=1,
        copy_mode="global",
        terms=(InputTerm("00", _S + 0j), InputTerm("11", _S + 0j)),
        memory=((1,), (0,), (0,), (0,)),
    )
    items = [
        Preset(
            "E1",
            "Classical address a = 10, b⁽¹⁰⁾ = 1",
            "arXiv appendix, Fig. rout_qram_cl: n = 2, m = 1. A₁ is red and sends the data "
            "right at level 1; A₂ is absent so the data go left at level 2 and reach cell "
            "(3,3) = |10⟩, which stores 1: D₁ stays red.",
            e1,
        ),
        Preset(
            "E1b",
            "Classical address a = 10, b⁽¹⁰⁾ = 0",
            "Same as E1 with the stored bit 0: the local copy erases D₁, the output has |∅⟩_D₁.",
            replace(e1, memory=((0,), (0,), (0,), (0,))),
        ),
        Preset(
            "E2",
            "Entangled address (|00⟩ + |11⟩)/√2",
            "arXiv appendix, Fig. rout_qram_ent: n = 2, m = 1, b⁽⁰⁰⁾ = 1, b⁽¹¹⁾ = 0. The two "
            "branches reach cells (3,1) and (3,4); the output is "
            "(|R⟩_D₁|∅⟩_A₂|∅⟩_A₁ + |∅⟩_D₁|R⟩_A₂|R⟩_A₁)/√2 (times |R⟩_D₀).",
            e2,
        ),
        Preset(
            "E1-switch",
            "E1 with the cell-switch copy",
            "E1 with copy_mode = cell_switch: D₀ switches the cell on, the copy fires while "
            "the switch is on, the delimiter D₂ switches it off.",
            replace(e1, copy_mode="cell_switch"),
        ),
        Preset(
            "E3",
            "Backup variant, a = 10: the Û_in / Û_B chain",
            "arXiv appendix §BackupGates: n = 2, m = 2 without the last backup D̃₂. At level 1 "
            "Û_in turns Ã₁ blue, then Û_B with controls Ã₁, Ã₂, D̃₁ passes the bit down the "
            "train two walkers at a time (A₂ is empty and stays empty). b⁽¹⁰⁾ = 10.",
            RunConfig(
                variant="backup",
                n=2,
                m=2,
                copy_mode="backup",
                options=Options(include_last_backup=False),
                terms=(InputTerm("10", 1 + 0j),),
                memory=((0, 0), (0, 1), (1, 0), (1, 1)),
            ),
        ),
        Preset(
            "E4",
            "Backup pipelining, n = 4, m = 2",
            "The technical paper, §Depth reduction: on 4-site edges the Û_B of level d and "
            "the Û_in / Û_B of level d + 1 fire in the same ticks. Address 1011, random "
            "memory.",
            RunConfig(
                variant="backup",
                n=4,
                m=2,
                copy_mode="backup",
                terms=(InputTerm("1011", 1 + 0j),),
                memory_fill="random",
                memory_seed=4,
            ),
        ),
        Preset(
            "backup-ghz",
            "Backup variant, (|000⟩ + |111⟩)/√2",
            "n = 3, m = 2 with the last backup D̃₂: two branches routed by short-range gates only.",
            RunConfig(
                variant="backup",
                n=3,
                m=2,
                copy_mode="backup",
                terms=input_terms("ghz", 3),
                memory_fill="identity",
            ),
        ),
        Preset(
            "qudit-short",
            "Qudit, short range: a = 10, b⁽¹⁰⁾ = 1",
            "The technical paper, §Qudit variant, short-range operations: every walker is a "
            "qudit (○ = 0, ● = 1). On 2-site edges Û_in flips the colour of A₂ because A₁ "
            "carries a 1, then Û_B passes the blue colour down the train one walker per tick; "
            "Ŝ_sr routes by colour only. No backups: the walkers are always present.",
            replace(e1, variant="qudit_short"),
        ),
        Preset(
            "qudit-long",
            "Qudit, long range: (|00⟩ + |11⟩)/√2",
            "The technical paper, §Qudit variant, long-range operations: Û⁽ᵈ⁾ = Û_○ ⊕ Û_● "
            "flips the colour of the walkers behind A_d in the logical subspace of A_d; Ŝ "
            "routes ● like the basic Ŝ and ○ mirrored (Ŝ X̂, as on the ↑ tree of the "
            "dual-rail variant). b⁽⁰⁰⁾ = 1 keeps D₁ in ●R, b⁽¹¹⁾ = 0 turns it ○R.",
            replace(e2, variant="qudit_long"),
        ),
        Preset(
            "dualrail",
            "Dual-rail: (|00⟩ + |11⟩)/√2",
            "The technical paper, §Dual-rail implementations: two trees, ↑ = 0 and ↓ = 1. "
            "The ↑ walkers run the photographic negative of the basic protocol. In cell |11⟩ "
            "the stored 0 turns D₁ blue and the output circuit (Ŝ_M, Ŝ_M†, X̂_c) moves it to "
            "the ↑ tree; it comes back on ↑ red at every node (Ŝ⁽↑⁾† from the right child "
            "keeps it red, and no ↑ address walker of this branch acts on it).",
            replace(e2, variant="dualrail_basic"),
        ),
        Preset(
            "dualrail-backup",
            "Dual-rail backup: a = 10, b⁽¹⁰⁾ = 01",
            "The technical paper, §Backup variant for dual-rail: every carrier has a backup "
            "on each tree (3(n + m) walkers); each tree runs the backup protocol on 4-site "
            "edges. The copy of D₁ (control Ã₂↓) reads 0: D₁ moves to the ↑ tree between the "
            "↑ backups.",
            RunConfig(
                variant="dualrail_backup",
                n=2,
                m=2,
                copy_mode="backup",
                terms=(InputTerm("10", 1 + 0j),),
                memory=((0, 0), (1, 1), (0, 1), (1, 0)),
            ),
        ),
        Preset(
            "noise-qudit",
            "Qudit with weak loss and logical dephasing",
            "(|00⟩ + |11⟩)/√2 on qudit_long, loss p = 0.01 while moving and logical dephasing "
            "p = 0.02: a loss leaves a missing walker, so the output is not well formed (it is "
            "heralded); a Ẑᴸ flip changes the relative sign of the branches and goes unseen.",
            replace(
                e2,
                variant="qudit_long",
                noise=(
                    {"model": "loss", "p": 0.01, "where": ["propagation"]},
                    {"model": "logical_dephasing", "p": 0.02, "where": ["propagation"]},
                ),
                seed=1,
            ),
        ),
        Preset(
            "noise-dualrail",
            "Dual-rail with a walker lost on the way",
            "E2 on dualrail_basic with D₁ lost at its first bifurcation: the slot stays empty on "
            "both rails, the copy finds no walker and the output is not well formed. Compare "
            "with noise-loss: there the same event reads as a valid bit 0.",
            replace(
                e2,
                variant="dualrail_basic",
                noise=(
                    {
                        "model": "loss",
                        "p": 1.0,
                        "where": ["scattering"],
                        "targets": ["D_1"],
                        "phases": ["routing"],
                    },
                ),
            ),
        ),
        Preset(
            "noise-loss",
            "E1 with D₁ lost at its first bifurcation",
            "Loss with p = 1 on D₁ at the scattering location during routing: the jump turns "
            "D₁ into ∅ (drawn as a ghost from then on); the output reads data 0 instead of 1.",
            replace(
                e1,
                noise=(
                    {
                        "model": "loss",
                        "p": 1.0,
                        "where": ["scattering"],
                        "targets": ["D_1"],
                        "phases": ["routing"],
                    },
                ),
            ),
        ),
        Preset(
            "noise-scatter",
            "E1 with D₁ misrouted",
            "Scatter flip with p = 1 on D₁ at every routing bifurcation: D₁ goes left at node "
            "(1,1) and right at node (2,1), reaching cell |01⟩ instead of |10⟩; on the way back "
            "it arrives blue at node (1,1), is bounced into the other subtree and collides with "
            "D₀.",
            replace(
                e1,
                noise=(
                    {"model": "scatter_flip", "p": 1.0, "targets": ["D_1"], "phases": ["routing"]},
                ),
            ),
        ),
        Preset(
            "noise-stray",
            "Stray walker and collision (n = 1)",
            "n = 1, m = 1, address 1, stored bits 0, D₁ misrouted at its only bifurcation: in "
            "cell |1⟩ the copy finds the D₁ site empty and creates a stray walker in D₁'s time "
            "bin; on the way back the stray and D₁ reach node (1,1) from the two children in "
            "the same tick, land on the same site, and the branch collides.",
            RunConfig(
                variant="basic",
                n=1,
                m=1,
                terms=(InputTerm("1", 1 + 0j),),
                memory=((0,), (0,)),
                noise=(
                    {"model": "scatter_flip", "p": 1.0, "targets": ["D_1"], "phases": ["routing"]},
                ),
            ),
        ),
        Preset(
            "noise-demo",
            "Uniform superposition with weak loss and dephasing",
            "n = 2, m = 1, four addresses; loss p = 0.01 while moving and presence dephasing "
            "p = 0.02 after gates. One quantum-jump trajectory per seed: re-roll to see others, "
            "or run an ensemble.",
            RunConfig(
                variant="basic",
                n=2,
                m=1,
                terms=input_terms("uniform", 2),
                memory=((1,), (0,), (1,), (0,)),
                noise=(
                    {"model": "loss", "p": 0.01, "where": ["propagation"]},
                    {"model": "presence_dephasing", "p": 0.02, "where": ["gate"]},
                ),
                seed=1,
            ),
        ),
        Preset(
            "coherent-demo",
            "E2 with coherent errors",
            "E2 with over-rotated colour flips (ε = 0.05) and imbalanced bifurcations "
            "(η = 0.05): every error splits a branch instead of jumping; the error branches "
            "are labelled like |11⟩′1, and the final fidelity is deterministic (no sampling).",
            replace(
                e2,
                noise=(
                    {"model": "overrotation", "epsilon": 0.05},
                    {"model": "beam_splitter_imbalance", "eta": 0.05},
                ),
            ),
        ),
        Preset(
            "demo-uniform",
            "Uniform superposition, n = 3, m = 2",
            "All eight addresses with equal amplitudes and random memory: every cell is "
            "queried at once and the branches recombine at the port.",
            RunConfig(
                variant="basic",
                n=3,
                m=2,
                terms=input_terms("uniform", 3),
                memory_fill="random",
                memory_seed=7,
            ),
        ),
    ]
    return {p.name: p for p in items}


PRESETS: dict[str, Preset] = _presets()


def get_preset(name: str) -> Preset:
    try:
        return PRESETS[name]
    except KeyError as exc:
        raise KeyError(f"unknown preset {name!r}; available: {', '.join(PRESETS)}") from exc
