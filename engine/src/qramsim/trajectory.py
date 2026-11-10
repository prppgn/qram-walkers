"""Trajectory format ``qramsim.traj/1`` (DESIGN.md §6): dataclasses, JSON, recorder.

A trajectory is everything a renderer needs, with no physics left to compute:

* ``meta``: slots, geometry, phase boundaries, gate objects, normalised input, memory;
* ``frames``: frame ``t = -1`` is the input state; frame ``t ≥ 0`` is the state at the
  *end* of tick ``t`` together with the events of that tick (gate firings with every
  local-state change, Ŝ/Ŝ† crossings, injections, exits, phase changes), each with an
  English narration sentence;
* ``final``: output branches, readout, metrics and resource counters.

Positions are ``[level, branch, site]``; level ``0`` is the port line outside the tree
(``site ≤ 0``: waiting to enter when moving forward, gone when moving backward).
Empty slots carry ``"s": "E"`` and, if ghosts are recorded, a ``ghost`` with colour,
position and direction (rendering only).
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from pathlib import Path
from typing import TYPE_CHECKING, Any

from . import alphabet
from .schedule import Phase
from .state import Branch, SparseState

if TYPE_CHECKING:
    from .simulator import Event, Simulator, Stage

TRAJ_SCHEMA = "qramsim.traj/1"


@dataclass(slots=True)
class GhostRecord:
    c: str
    pos: list[int]
    dir: int

    def to_dict(self) -> dict[str, Any]:
        return {"c": self.c, "pos": list(self.pos), "dir": self.dir}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> GhostRecord:
        return cls(str(d["c"]), [int(x) for x in d["pos"]], int(d["dir"]))


@dataclass(slots=True)
class WalkerRecord:
    k: int
    s: str
    pos: list[int] | None = None
    dir: int | None = None
    ghost: GhostRecord | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {"k": self.k, "s": self.s}
        if self.pos is not None:
            d["pos"] = list(self.pos)
            d["dir"] = self.dir
        if self.ghost is not None:
            d["ghost"] = self.ghost.to_dict()
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> WalkerRecord:
        ghost = GhostRecord.from_dict(d["ghost"]) if "ghost" in d else None
        pos = [int(x) for x in d["pos"]] if "pos" in d else None
        direction = int(d["dir"]) if "dir" in d else None
        return cls(int(d["k"]), str(d["s"]), pos, direction, ghost)


@dataclass(slots=True)
class StrayRecord:
    """A walker outside the train's slots (DECISION D21); ``k`` is its time bin."""

    k: int
    s: str
    pos: list[int]
    dir: int

    def to_dict(self) -> dict[str, Any]:
        return {"k": self.k, "s": self.s, "pos": list(self.pos), "dir": self.dir}

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> StrayRecord:
        return cls(int(d["k"]), str(d["s"]), [int(x) for x in d["pos"]], int(d["dir"]))


@dataclass(slots=True)
class BranchRecord:
    id: int
    amp: tuple[float, float]
    walkers: list[WalkerRecord]
    cells_on: list[int] = field(default_factory=list)
    strays: list[StrayRecord] = field(default_factory=list)
    collided: bool = False

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "id": self.id,
            "amp": [self.amp[0], self.amp[1]],
            "walkers": [w.to_dict() for w in self.walkers],
            "cells": {"on": list(self.cells_on)},
        }
        if self.strays:
            d["strays"] = [x.to_dict() for x in self.strays]
        if self.collided:
            d["collided"] = True
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> BranchRecord:
        return cls(
            int(d["id"]),
            (float(d["amp"][0]), float(d["amp"][1])),
            [WalkerRecord.from_dict(w) for w in d["walkers"]],
            [int(x) for x in d.get("cells", {}).get("on", [])],
            [StrayRecord.from_dict(x) for x in d.get("strays", [])],
            bool(d.get("collided", False)),
        )

    @classmethod
    def from_branch(cls, br: Branch, family: alphabet.Family, ghosts: bool) -> BranchRecord:
        walkers = []
        for k, (w, p) in enumerate(zip(br.slots, br.present, strict=True)):
            if p:
                walkers.append(
                    WalkerRecord(k, alphabet.short(family, w.s), [w.level, w.branch, w.site], w.dir)
                )
            else:
                ghost = (
                    GhostRecord(alphabet.short(family, w.s), [w.level, w.branch, w.site], w.dir)
                    if ghosts
                    else None
                )
                walkers.append(WalkerRecord(k, "E", ghost=ghost))
        strays = [
            StrayRecord(
                x.k, alphabet.short(family, x.w.s), [x.w.level, x.w.branch, x.w.site], x.w.dir
            )
            for x in br.strays
        ]
        return cls(
            br.bid, (br.amp.real, br.amp.imag), walkers, sorted(br.cells_on), strays, br.collided
        )


@dataclass(slots=True)
class Frame:
    t: int
    phase: str
    branches: list[BranchRecord]
    events: list[dict[str, Any]] = field(default_factory=list)
    metrics: dict[str, float] | None = None
    # branches not stored because of record.max_frame_branches: {"count", "weight"}
    omitted: dict[str, float] | None = None

    def to_dict(self) -> dict[str, Any]:
        d: dict[str, Any] = {
            "t": self.t,
            "phase": self.phase,
            "branches": [b.to_dict() for b in self.branches],
            "events": self.events,
        }
        if self.metrics is not None:
            d["metrics"] = self.metrics
        if self.omitted is not None:
            d["omitted"] = self.omitted
        return d

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Frame:
        return cls(
            int(d["t"]),
            str(d["phase"]),
            [BranchRecord.from_dict(b) for b in d["branches"]],
            list(d.get("events", [])),
            d.get("metrics"),
            d.get("omitted"),
        )


def largest_branches(
    branches: list[Branch], limit: int
) -> tuple[list[Branch], dict[str, float] | None]:
    """The ``limit`` branches of largest weight (sorted by id) and what was left out."""
    if len(branches) <= limit:
        return sorted(branches, key=lambda b: b.bid), None
    ranked = sorted(branches, key=lambda b: (-abs(b.amp), b.bid))
    kept, rest = ranked[:limit], ranked[limit:]
    omitted = {"count": len(rest), "weight": sum(abs(b.amp) ** 2 for b in rest)}
    return sorted(kept, key=lambda b: b.bid), omitted


@dataclass
class Trajectory:
    config: dict[str, Any]
    meta: dict[str, Any]
    frames: list[Frame]
    final: dict[str, Any]
    schema: str = TRAJ_SCHEMA

    def to_dict(self) -> dict[str, Any]:
        return {
            "schema": self.schema,
            "config": self.config,
            "meta": self.meta,
            "frames": [f.to_dict() for f in self.frames],
            "final": self.final,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Trajectory:
        errors = validate(d)
        if errors:
            raise ValueError("invalid trajectory: " + "; ".join(errors[:5]))
        return cls(
            config=d["config"],
            meta=d["meta"],
            frames=[Frame.from_dict(f) for f in d["frames"]],
            final=d["final"],
            schema=d["schema"],
        )

    def to_json(self, indent: int | None = None) -> str:
        if indent is None:
            return json.dumps(self.to_dict(), separators=(",", ":"), ensure_ascii=False)
        return json.dumps(self.to_dict(), indent=indent, ensure_ascii=False)

    @classmethod
    def from_json(cls, text: str) -> Trajectory:
        return cls.from_dict(json.loads(text))

    def save(self, path: str | Path, indent: int | None = None) -> None:
        Path(path).write_text(self.to_json(indent), encoding="utf-8")

    @classmethod
    def load(cls, path: str | Path) -> Trajectory:
        return cls.from_json(Path(path).read_text(encoding="utf-8"))

    def events(self) -> list[tuple[int, dict[str, Any]]]:
        return [(f.t, e) for f in self.frames for e in f.events]


def validate(d: Any) -> list[str]:
    """Structural validation of a trajectory dictionary; returns a list of errors."""
    errors: list[str] = []
    if not isinstance(d, dict):
        return ["trajectory is not an object"]
    schema = d.get("schema")
    if not isinstance(schema, str) or schema.split("/")[0] != "qramsim.traj":
        errors.append(f"unknown schema {schema!r}")
    elif schema.split("/")[1].split(".")[0] != "1":
        errors.append(f"unsupported major version in {schema!r}")
    for key in ("config", "meta", "frames", "final"):
        if key not in d:
            errors.append(f"missing {key!r}")
    if errors:
        return errors
    meta = d["meta"]
    for key in ("variant", "n", "m", "K", "slots", "geometry", "phases", "gates"):
        if key not in meta:
            errors.append(f"meta lacks {key!r}")
    if errors:
        return errors
    K = meta["K"]
    if len(meta["slots"]) != K:
        errors.append("meta.slots length differs from K")
    phases = meta["phases"]
    frames = d["frames"]
    if frames:
        if len(frames) != phases["T_total"] + 1:
            errors.append(f"expected {phases['T_total'] + 1} frames, got {len(frames)}")
        for i, f in enumerate(frames):
            if f.get("t") != i - 1:
                errors.append(f"frame {i} has t = {f.get('t')}, expected {i - 1}")
                break
            for b in f.get("branches", []):
                if len(b.get("walkers", [])) != K:
                    errors.append(f"frame {i}: branch {b.get('id')} has the wrong slot count")
                    break
            if errors:
                break
    for key in ("state", "metrics", "resources"):
        if key not in d["final"]:
            errors.append(f"final lacks {key!r}")
    return errors


class TrajectoryRecorder:
    """Builds the frames of a trajectory from the simulator callbacks."""

    def __init__(
        self, ghosts: bool = True, frame_metrics: bool = False, max_branches: int = 64
    ) -> None:
        self.ghosts = ghosts
        self.frame_metrics = frame_metrics
        self.max_branches = max_branches
        self.frames: list[Frame] = []
        self._family = alphabet.Family.BOSONIC
        self._slots: tuple[Any, ...] = ()

    def _records(self, state: SparseState) -> tuple[list[BranchRecord], dict[str, float] | None]:
        kept, omitted = largest_branches(list(state), self.max_branches)
        return [BranchRecord.from_branch(b, self._family, self.ghosts) for b in kept], omitted

    def _metrics(self, state: SparseState) -> dict[str, float] | None:
        if not self.frame_metrics:
            return None
        from .metrics import entropy_AD

        return {"entropy_AD": entropy_AD(state, self._slots), "norm": state.norm_sq()}

    def start(self, sim: Simulator, state: SparseState) -> None:
        self._family = sim.variant.family
        self._slots = sim.variant.slots
        records, omitted = self._records(state)
        self.frames.append(Frame(-1, "init", records, [], self._metrics(state), omitted))

    def stage(self, t: int, stage: Stage, state: SparseState) -> None:
        pass

    def tick(self, t: int, phase: Phase, state: SparseState, events: list[Event]) -> None:
        records, omitted = self._records(state)
        self.frames.append(
            Frame(t, str(phase), records, list(events), self._metrics(state), omitted)
        )

    def finish(self, sim: Simulator, state: SparseState) -> None:
        pass
