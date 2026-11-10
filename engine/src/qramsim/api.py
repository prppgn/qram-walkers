"""Public entry point: run a configuration and collect the trajectory."""

from __future__ import annotations

from collections.abc import Sequence
from dataclasses import dataclass
from typing import Any

from .config import RunConfig
from .kets import SnapshotRecorder, paper_checkpoints
from .metrics import all_metrics
from .resources import resources
from .schedule import GateInstance, Schedule
from .simulator import Counters, Recorder, Simulator
from .state import SparseState
from .trajectory import BranchRecord, Trajectory, TrajectoryRecorder, largest_branches
from .variants import Variant


@dataclass
class SimulationResult:
    config: RunConfig  # resolved
    variant: Variant
    schedule: Schedule
    initial: SparseState
    final: SparseState
    ideal: SparseState
    counters: Counters
    metrics: dict[str, float]
    resources: dict[str, Any]
    trajectory: Trajectory


def _gate_meta(schedule: Schedule) -> list[dict[str, Any]]:
    out: dict[str, dict[str, Any]] = {}
    for g in schedule.all():
        entry = out.setdefault(
            g.id,
            {
                "id": g.id,
                "type": str(g.kind),
                "level": g.level,
                "label": g.label,
                "control_site": g.control_site,
                "target_sites": list(g.target_sites),
                "window": list(g.window),
                "target_bits": list(g.target_bits),
                "control_slot": g.control_slot,
                "target_slots": list(g.target_slots),
                "ticks": {},
            },
        )
        entry["ticks"][str(g.phase)] = g.tick
    return list(out.values())


def _meta(sim: Simulator) -> dict[str, Any]:
    meta = sim.variant.describe()
    sched = sim.schedule
    meta["phases"] = {"T_fwd": sched.T_fwd, "T_q": sched.T_q, "T_total": sched.T_total}
    meta["gates"] = _gate_meta(sched)
    meta["input_normalised"] = [
        {"id": bid, "address": t.address, "amp": [t.amp.real, t.amp.imag]}
        for bid, t in enumerate(sim.terms)
    ]
    meta["memory"] = [list(row) for row in sim.memory]
    meta["marks"] = {"level": _level_marks(sim)}
    meta["branch_labels"] = {str(b): name for b, name in sim.branch_names.items()}
    if sim.channels:
        meta["noise"] = sim.noise_meta()
    return meta


def _level_marks(sim: Simulator) -> list[dict[str, Any]]:
    """Ticks at which the leading slot crosses a bifurcation (viewer's "level" step).

    Forward the front slot leads; in the inverse phase the train comes back tail-first.
    """
    geo, sched, slots = sim.geometry, sim.schedule, sim.variant.slots
    front, tail = slots[0], slots[-1]
    marks = []
    for d in range(1, geo.n + 1):
        t = geo.X(d, geo.sites(d))
        where = "its memory lane" if d == geo.n else f"level {d + 1}"
        marks.append({"t": t, "label": f"{front.label} crosses into {where}"})
    for d in range(geo.n, 0, -1):
        t = sched.mirror(geo.X(d, geo.sites(d)) + sim.variant.span - 1)
        marks.append({"t": t, "label": f"{tail.label} crosses back into level {d}"})
    return sorted(marks, key=lambda m: int(m["t"]))


def _checkpoints(sim: Simulator, snaps: SnapshotRecorder, ghosts: bool) -> list[dict[str, Any]]:
    family = sim.variant.family
    return [
        {
            "name": cp.name,
            "description": cp.description,
            "t": cp.tick,
            "branches": [
                BranchRecord.from_branch(b, family, ghosts).to_dict() for b in cp.branches
            ],
        }
        for cp in paper_checkpoints(sim, snaps)
    ]


def simulate(config: RunConfig, recorders: Sequence[Recorder] = ()) -> SimulationResult:
    """Run one configuration; frames are recorded when ``config.record.frames``."""
    sim = Simulator(config)
    cfg = sim.config
    rec = TrajectoryRecorder(
        cfg.record.ghosts, cfg.record.frame_metrics, cfg.record.max_frame_branches
    )
    all_recorders: list[Recorder] = list(recorders)
    snaps: SnapshotRecorder | None = None
    if cfg.record.frames:
        all_recorders.insert(0, rec)
        if not sim.active:
            snaps = SnapshotRecorder()
            all_recorders.append(snaps)
    initial = sim.variant.initial_state(sim.terms)
    final = sim.run(all_recorders)
    ideal = sim.variant.ideal_output(sim.terms)
    metrics = all_metrics(final, ideal, sim.variant)
    metrics["discarded"] = sim.discarded
    res = resources(sim.variant, sim.schedule, sim.counters, initial)
    family = sim.variant.family
    readout = []
    shown, state_omitted = largest_branches(list(final), max(256, cfg.record.max_frame_branches))
    for br in shown:
        r = sim.variant.readout(br)
        readout.append(
            {
                "id": br.bid,
                "amp": [br.amp.real, br.amp.imag],
                "prob": abs(br.amp) ** 2,
                "address": r.address,
                "data": "".join(str(b) for b in r.data),
                "expected_data": "".join(str(b) for b in sim.variant.stored(r.address)),
                "well_formed": r.well_formed,
                **({"erased": list(r.erased)} if r.erased else {}),
            }
        )
    trajectory = Trajectory(
        config=cfg.to_dict(),
        meta=_meta(sim),
        frames=rec.frames,
        final={
            "state": [
                BranchRecord.from_branch(b, family, cfg.record.ghosts).to_dict() for b in shown
            ],
            "state_omitted": state_omitted,
            "readout": readout,
            "metrics": metrics,
            "resources": res,
            "checkpoints": [] if snaps is None else _checkpoints(sim, snaps, cfg.record.ghosts),
        },
    )
    return SimulationResult(
        cfg,
        sim.variant,
        sim.schedule,
        initial,
        final,
        ideal,
        sim.counters,
        metrics,
        res,
        trajectory,
    )


def gate_instances(config: RunConfig) -> list[GateInstance]:
    """The full schedule of a configuration (no simulation)."""
    return list(Simulator(config).schedule.all())
