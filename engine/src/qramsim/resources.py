"""Resource counters and the paper's closed formulas (PROTOCOL.md §7)."""

from __future__ import annotations

from collections import Counter
from typing import TYPE_CHECKING, Any

from .schedule import Schedule
from .state import SparseState

if TYPE_CHECKING:
    from .simulator import Counters
    from .variants import Variant


def _plain(d: Any) -> Any:
    if isinstance(d, dict):
        return {str(k): _plain(v) for k, v in d.items()}
    return d


def resources(
    variant: Variant, schedule: Schedule, counters: Counters, initial: SparseState
) -> dict[str, Any]:
    geo = variant.geometry
    n = variant.n
    per_tick_ops: Counter[int] = Counter()
    instances: dict[str, Counter[str]] = {}
    for g in schedule.all():
        per_tick_ops[g.tick] += geo.n_edges(g.level)
        instances.setdefault(str(g.phase), Counter())[str(g.kind)] += 1
    walkers = [sum(b.present) for b in initial]
    probs = [abs(b.amp) ** 2 for b in initial]
    paper = variant.paper_resources()
    trees = variant.rules.trees
    return {
        "K": variant.K,
        "span": variant.span,
        "trees": trees,
        "levels": n,
        "walkers_input": {
            "max": max(walkers),
            "expected": sum(w * p for w, p in zip(walkers, probs, strict=True)),
        },
        "gate_instances": {k: dict(v) for k, v in instances.items()},
        "gate_locations": variant.gate_locations(),
        "activations": _plain(counters.activations),
        "activations_expected": _plain(counters.activations_expected),
        "S_crossings_expected": _plain(counters.crossings),
        "S_bounces_expected": counters.bounces,
        "noise_events": _plain(counters.noise_events),
        "sites_per_level": [geo.sites(d) for d in range(1, n + 2)],
        "sites_path": geo.sites_path,
        "sites_path_tree_only": geo.sites_path - geo.sites(geo.lane_level),
        "sites_total": geo.sites_total * trees,
        "T_fwd": schedule.T_fwd,
        "T_q": schedule.T_q,
        "T_total": schedule.T_total,
        "max_instances_per_tick": schedule.max_instances_per_tick(),
        "max_gate_ops_per_tick": max(per_tick_ops.values(), default=0),
        "paper": paper,
        "notes": _notes(variant),
    }


def _notes(variant: Variant) -> list[str]:
    notes = []
    if variant.name in ("basic", "qudit_long", "dualrail_basic"):
        notes.append(
            "Engine edges host the control plus every slot behind it: n_sites(d) = K − d + 1 "
            "(paper: n + m − d); the difference is a constant per level."
        )
    if variant.rules.trees == 2:
        notes.append(
            "Two trees: sites_total counts both; sites_path is one root-to-cell path. The "
            "walkers start on their rails: the paper's T_prep is not simulated."
        )
    if variant.name.startswith("dualrail"):
        notes.append(
            "The output circuit of the cells (Ŝ_M, Ŝ_M†, X̂_c) runs in the lane during the query "
            "(three ticks after the copies)."
        )
    notes.append(
        "The memory lane hosts the whole train at rest: "
        "T_total = 2·T_fwd + T_q, not the paper's pass-through depth constant."
    )
    if variant.name == "backup":
        notes.append(
            "Backup: the engine's T_fwd = 4n + K equals the paper's routing time 6n + 2m "
            "when K = 2(n + m); the round trip adds 4n + K again."
        )
    return notes
