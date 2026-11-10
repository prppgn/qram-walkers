"""Tick loop: routing, query and time-reversed inverse routing (DESIGN.md §3.4).

One forward tick = the clock-scheduled gates of that tick fire (in schedule order),
then every walker moves one site along its direction; a walker leaving the last site
of an edge crosses the bifurcation through Ŝ. Query ticks fire gates without motion.
An inverse tick replays forward tick ``t = T_fwd − 1 − τ`` backwards: first the motion
is undone (walkers cross bifurcations through Ŝ†), then the gates of tick ``t`` fire
again in reverse order (they are self-adjoint permutations). At the end of the query
phase every direction is flipped.

The simulator moves each walker individually and evaluates gates on whatever occupies
their windows in each branch; the ideal timing ``x(k, t) = t − k`` is used only to
build the schedule (and checked in strict mode).

Noise (DESIGN.md §4, DECISION D27) enters through hooks: channels after each gate, before
each crossing, after each move and during the query; classical gate failures, inverted
copies, clock jitter and memory flips. A copy on a site no slot occupies creates a
walker in the site's time bin or a stray walker (D21); two walkers on one site freeze
their branch as collided (D26).
"""

from __future__ import annotations

import cmath
import itertools
import math
from collections import defaultdict
from collections.abc import Sequence
from dataclasses import dataclass, field, replace
from enum import StrEnum
from typing import Any, Protocol

import numpy as np

from . import narration
from .alphabet import BLUE, EMPTY, RED
from .config import RunConfig
from .gates import (
    COPY_GATES,
    LANE_GATES,
    PASSIVE_GATES,
    X_GATES,
    X_TABLE,
    GateKind,
    Port,
)
from .geometry import PORT_LEVEL
from .noise import STOCHASTIC, NoiseChannel, apply_channel, parse_noise
from .schedule import GateInstance, Phase, Schedule, retime
from .state import Branch, SparseState, Stray, Walker
from .variants import Variant, make_variant

Event = dict[str, Any]


class EngineError(RuntimeError):
    """The dynamics left the model (e.g. a walker ran past the end of a memory lane)."""


class InvariantViolation(AssertionError):
    """A runtime invariant of PROTOCOL.md §8.2 failed in strict mode."""


class Stage(StrEnum):
    START = "start"  # beginning of the tick
    POST_GATES = "post_gates"
    POST_MOVE = "post_move"


class Recorder(Protocol):
    def start(self, sim: Simulator, state: SparseState) -> None: ...

    def stage(self, t: int, stage: Stage, state: SparseState) -> None: ...

    def tick(self, t: int, phase: Phase, state: SparseState, events: list[Event]) -> None: ...

    def finish(self, sim: Simulator, state: SparseState) -> None: ...


# Motion outcomes of a single walker.
_NONE, _INJECT, _EXIT, _S_FWD, _S_UP, _S_BOUNCE, _ABSORB = range(7)

TREE_GATES = frozenset({GateKind.U, GateKind.U_IN, GateKind.U_B})


@dataclass
class Counters:
    """Per-run counters (expected values are weighted by branch probabilities)."""

    crossings: dict[str, float] = field(default_factory=lambda: defaultdict(float))
    bounces: float = 0.0
    activations: dict[str, dict[str, int]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(int))
    )
    activations_expected: dict[str, dict[str, float]] = field(
        default_factory=lambda: defaultdict(lambda: defaultdict(float))
    )
    noise_events: dict[str, int] = field(default_factory=lambda: defaultdict(int))


@dataclass
class _Firing:
    """Context of one gate instance firing at one tick (shared by all branches)."""

    gate: GateInstance
    t: int
    tau: int  # clock: slot k sits at x = tau − k
    direction: int
    failed: dict[int, bool] = field(default_factory=dict)  # edge → gate failure
    flipped: dict[int, bool] = field(default_factory=dict)  # lane → inverted copy
    strays: list[dict[str, Any]] = field(default_factory=list)


class Simulator:
    def __init__(self, config: RunConfig) -> None:
        self.config = config.resolve()
        self.variant: Variant = make_variant(self.config)
        self.rules = self.variant.rules
        self.geometry = self.variant.geometry
        self.terms = self.config.terms
        self.branch_names = {bid: f"|{t.address}⟩" for bid, t in enumerate(self.terms)}
        self.counters = Counters()
        self._sites = (0, *self.geometry.level_sites)  # index by level
        self._lane = self.geometry.lane_level
        # noise
        self.channels: list[NoiseChannel] = parse_noise(self.config.noise, self.variant)
        self.active = [c for c in self.channels if c.active]
        self.kraus_channels = [c for c in self.active if c.model in STOCHASTIC]
        self.rng = np.random.default_rng(self.config.seed)
        self.intended_memory = self.variant.memory_bits()
        self.memory, self.memory_flips = self._noisy_memory()
        self.schedule, self.jitter = self._jittered(self.variant.schedule())
        self.strict = self.config.options.strict and not self.active
        # coherent errors (DECISION D30)
        self.overrotations = [c for c in self.active if c.model == "overrotation"]
        self.imbalances = [c for c in self.active if c.model == "beam_splitter_imbalance"]
        self.coherent = bool(self.overrotations or self.imbalances)
        # one sample per physical element: dual-rail gates and nodes differ between the trees
        self._eps: dict[tuple[int, str, int, int], float] = {}
        self._eta: dict[tuple[int, int, int, int], float] = {}
        self.discarded = 0.0
        self._pruned_count = 0
        self._pruned_weight = 0.0
        self._name_counts: dict[int, int] = defaultdict(int)
        if self.config.options.strict and self.active:
            self.variant.warnings.append(
                "strict invariants are disabled in noisy runs (they describe the ideal protocol)"
            )

    # -- classical noise prepared before the run ---------------------------------------

    def _channels(self, model: str) -> list[NoiseChannel]:
        return [c for c in self.active if c.model == model]

    def _noisy_memory(self) -> tuple[tuple[tuple[int, ...], ...], list[dict[str, Any]]]:
        memory = [list(row) for row in self.intended_memory]
        flips: list[dict[str, Any]] = []
        for ch in self._channels("memory_bit_flip"):
            for l, row in enumerate(memory, start=1):
                for j in range(len(row)):
                    if self.rng.random() < ch.p:
                        row[j] = 1 - row[j]
                        flips.append(
                            {"l": l, "address": self.geometry.address_of_cell(l), "j": j + 1}
                        )
        return tuple(tuple(r) for r in memory), flips

    def _location(self, gate: GateInstance) -> str:
        if gate.kind in PASSIVE_GATES:
            return "passive"  # no noise location: a passive element has nothing to fail (D35)
        return "gate" if gate.kind in TREE_GATES else "memory"

    def _applies(self, ch: NoiseChannel, gate: GateInstance, phase: Phase) -> bool:
        return (
            self._location(gate) in ch.where
            and str(phase) in ch.phases
            and (ch.gates is None or str(gate.kind) in ch.gates)
        )

    def _jittered(self, schedule: Schedule) -> tuple[Schedule, list[dict[str, Any]]]:
        channels = self._channels("clock_jitter")
        if not channels:
            return schedule, []
        shifts: dict[int, int] = {}
        log: list[dict[str, Any]] = []
        for i, g in enumerate(schedule.all()):
            shift = 0
            for ch in channels:
                if not self._applies(ch, g, g.phase):
                    continue
                r = self.rng.random()
                if r < ch.p_early:
                    shift -= 1
                elif r < ch.p_early + ch.p_late:
                    shift += 1
            if shift:
                shifts[i] = shift
                log.append({"gate": g.id, "phase": str(g.phase), "tick": g.tick, "shift": shift})
        return retime(schedule, shifts), log

    def _on_tree(self, tree: int) -> dict[str, int]:
        return {"tree": tree} if self.rules.trees > 1 else {}

    def noise_meta(self) -> dict[str, Any]:
        return {
            "channels": [
                {
                    "model": c.model,
                    "p": c.p,
                    "p_early": c.p_early,
                    "p_late": c.p_late,
                    "where": sorted(c.where),
                    "targets": [self.variant.slots[k].name for k in sorted(c.targets)],
                    "phases": sorted(c.phases),
                    "active": c.active,
                }
                for c in self.channels
            ],
            "seed": self.config.seed,
            "memory_flips": self.memory_flips,
            "memory_actual": [list(r) for r in self.memory],
            "jitter": self.jitter,
            "coherent": [
                {"model": "overrotation", "gate": g, "edge": l, "epsilon": e, **self._on_tree(t)}
                for (_, g, t, l), e in sorted(self._eps.items())
            ]
            + [
                {"model": "beam_splitter_imbalance", "node": [d, l], "eta": e, **self._on_tree(t)}
                for (_, t, d, l), e in sorted(self._eta.items())
            ],
        }

    # -- clock helpers -----------------------------------------------------------------

    def _tau(self, t: int, stage: Stage) -> int:
        """Clock reference: at stage ``stage`` of tick ``t`` slot k sits at x = τ − k."""
        sched = self.schedule
        phase = sched.phase_of(t)
        if phase is Phase.ROUTING:
            return t + (1 if stage is Stage.POST_MOVE else 0)
        if phase is Phase.QUERY:
            return sched.T_fwd
        return sched.mirror(t) + (0 if stage is not Stage.START else 1)

    def _direction(self, t: int) -> int:
        return -1 if self.schedule.phase_of(t) is Phase.INVERSE else +1

    def _clock_pos(self, k: int, tau: int) -> tuple[int, int]:
        return self.geometry.locate(tau - self.variant.offset(k))

    def _short(self, s: int) -> str:
        return self.rules.short(s)

    # -- coherent errors (DECISION D30) ----------------------------------------------

    def _sample(self, cache: dict[Any, float], key: Any, mean: float, sigma: float) -> float:
        if key not in cache:
            cache[key] = mean if sigma == 0 else float(self.rng.normal(mean, sigma))
        return cache[key]

    def _theta(self, gate: GateInstance, tree: int, l: int, phase: Phase) -> tuple[float, float]:
        """Over-rotation angle of gate ``gate`` on edge ``l`` of ``tree`` and the part of it
        that also dresses empty targets (only with ``vacuum_phase``, DECISION D31)."""
        theta = vac = 0.0
        for ch in self.overrotations:
            if str(phase) not in ch.phases or (
                ch.gates is not None and str(gate.kind) not in ch.gates
            ):
                continue
            eps = self._sample(self._eps, (ch.index, gate.id, tree, l), ch.epsilon, ch.sigma)
            theta += eps * math.pi / 2
            if ch.vacuum_phase:
                vac += eps * math.pi / 2
        return theta, vac

    def _phi(self, tree: int, d: int, l: int, phase: Phase) -> tuple[float, str]:
        phi = 0.0
        mode = "reciprocal"
        for ch in self.imbalances:
            if str(phase) not in ch.phases:
                continue
            eta = self._sample(self._eta, (ch.index, tree, d, l), ch.epsilon, ch.sigma)
            phi += eta * math.pi / 2
            mode = ch.backward
        return phi, mode

    def _new_bid(self, parent: int, alloc: Any) -> int:
        bid = int(next(alloc))
        self._name_counts[parent] += 1
        base = self.branch_names.get(parent, f"#{parent}")
        self.branch_names[bid] = f"{base}′{self._name_counts[parent]}"
        return bid

    def _expand(
        self,
        br: Branch,
        alternatives: list[tuple[complex, Any, complex]],
        apply_alt: Any,
        alloc: Any,
    ) -> list[Branch]:
        """Products of independent two-term splits.

        ``alternatives`` lists (main coefficient, alternative data, alternative
        coefficient); ``apply_alt(branch, data)`` builds the alternative branch.
        Terms are pruned at ``prune_eps`` only after they have merged with the rest of
        the state (``_prune``): dropping an amplitude ``a`` before merging would change
        the norm by ``~2|A||a|`` through interference, far more than ``|a|²``. Here only
        amplitudes below ``prune_eps`` itself (weights below ``prune_eps²``) are dropped,
        which bounds that effect by ``2·prune_eps``.
        """
        eps = self.config.options.prune_eps**2
        terms = [(br, br.amp)]
        for c_main, data, c_alt in alternatives:
            nxt = []
            for b, amp in terms:
                for coef, alt in ((c_main, False), (c_alt, True)):
                    a = amp * coef
                    w = abs(a) ** 2
                    if w == 0:
                        continue
                    if w < eps:
                        self.discarded += w
                        self._pruned_count += 1
                        self._pruned_weight += w
                        continue
                    nxt.append((apply_alt(b, data) if alt else b, a))
            terms = nxt
        if not terms:
            return []
        main = max(range(len(terms)), key=lambda i: abs(terms[i][1]))
        out = []
        for i, (b, a) in enumerate(terms):
            bid = br.bid if i == main else self._new_bid(br.bid, alloc)
            out.append(b.copy_with(amp=a) if i == main else replace(b, amp=a, bid=bid))
        return out

    def _prune(self, state: SparseState) -> SparseState:
        if not self.coherent:
            return state
        w = state.prune(self.config.options.prune_eps)
        dropped = 0
        cap = self.config.options.max_branches
        if len(state) > cap:
            keep = sorted(state, key=lambda b: abs(b.amp), reverse=True)[:cap]
            w += sum(abs(b.amp) ** 2 for b in state) - sum(abs(b.amp) ** 2 for b in keep)
            dropped = len(state) - cap
            state = SparseState(keep, next_bid=state.next_bid)
        if w > 0:
            self.discarded += w
            self._pruned_count += dropped
            self._pruned_weight += w
        return state

    def _prune_event(self, events: list[Event]) -> None:
        count, weight = self._pruned_count, self._pruned_weight
        if weight > 0:
            events.append(
                {
                    "kind": "noise",
                    "model": "prune",
                    "count": count,
                    "weight": weight,
                    "text": narration.prune_text(
                        count, weight, self.discarded, self.config.options.prune_eps
                    ),
                }
            )
        self._pruned_count = 0
        self._pruned_weight = 0.0

    # -- public --------------------------------------------------------------------

    def run(self, recorders: Sequence[Recorder] = ()) -> SparseState:
        sched = self.schedule
        state = self.variant.initial_state(self.terms)
        if self.strict:
            self._check_positions(state, 0)
        for rec in recorders:
            rec.start(self, state)
        turn_tick = sched.T_fwd + sched.T_q - 1
        for t in range(sched.T_total):
            phase = sched.phase_of(t)
            events: list[Event] = []
            if t == 0:
                events.append(self._phase_event(Phase.ROUTING))
                if self.memory_flips:
                    events.append(self._memory_flip_event())
            elif t == sched.T_fwd and sched.T_q > 0:
                events.append(self._phase_event(Phase.QUERY))
            elif t == sched.T_fwd + sched.T_q:
                events.append(self._phase_event(Phase.INVERSE))
            for rec in recorders:
                rec.stage(t, Stage.START, state)
            if phase is Phase.ROUTING:
                state = self._fire_all(t, state, events)
                for rec in recorders:
                    rec.stage(t, Stage.POST_GATES, state)
                state = self._move_with_noise(t, phase, state, events)
                for rec in recorders:
                    rec.stage(t, Stage.POST_MOVE, state)
                if self.strict:
                    self._check_positions(state, t + 1)
            elif phase is Phase.QUERY:
                state = self._fire_all(t, state, events)
                state = self._noise_idle(t, state, events)
                for rec in recorders:
                    rec.stage(t, Stage.POST_GATES, state)
            else:
                state = self._move_with_noise(t, phase, state, events)
                for rec in recorders:
                    rec.stage(t, Stage.POST_MOVE, state)
                if self.strict:
                    self._check_positions(state, sched.mirror(t))
                state = self._fire_all(t, state, events)
                for rec in recorders:
                    rec.stage(t, Stage.POST_GATES, state)
            if self.strict:
                self._check_lanes(state, t)
            if t == turn_tick:
                if self.strict and sched.T_q > 0:
                    self._check_switches_off(state)
                if self.active and self.rules.trees > 1:
                    state = self._empty_aux_rail(t, state, events)
                state = state.with_directions(-1)
                events.append({"kind": "turn", "text": narration.turn_text(self.variant)})
            if self.coherent:
                self._prune_event(events)
            if t == sched.T_total - 1:
                events.append(self._phase_event(None))
            for rec in recorders:
                rec.tick(t, phase, state, events)
        if self.strict:
            self._check_final(state)
        for rec in recorders:
            rec.finish(self, state)
        return state

    # -- gates ---------------------------------------------------------------------

    def _fire_all(self, t: int, state: SparseState, events: list[Event]) -> SparseState:
        for gate in self.schedule.gates_at(t):
            state = self._fire(gate, t, state, events)
        return state

    def _gate_failed(self, ctx: _Firing, l: int) -> bool:
        """Sampled once per firing and edge, when the gate would act (DECISION D27)."""
        if l not in ctx.failed:
            failed = False
            phase = self.schedule.phase_of(ctx.t)
            for ch in self._channels("gate_failure"):
                if self._applies(ch, ctx.gate, phase) and self.rng.random() < ch.p:
                    failed = True
            ctx.failed[l] = failed
        return ctx.failed[l]

    def _copy_flipped(self, ctx: _Firing, l: int) -> bool:
        if l not in ctx.flipped:
            flipped = False
            phase = self.schedule.phase_of(ctx.t)
            for ch in self._channels("copy_error"):
                if self._applies(ch, ctx.gate, phase) and self.rng.random() < ch.p:
                    flipped = not flipped
            ctx.flipped[l] = flipped
        return ctx.flipped[l]

    def _fire(
        self, gate: GateInstance, t: int, state: SparseState, events: list[Event]
    ) -> SparseState:
        # Gates fire before the motion in routing ticks and after it in inverse ticks.
        stage = Stage.POST_MOVE if self._direction(t) < 0 else Stage.START
        ctx = _Firing(gate, t, self._tau(t, stage), self._direction(t))
        fired_in: list[int] = []
        edges: set[int] = set()
        changes: list[dict[str, Any]] = []
        expected = 0.0
        alloc = itertools.count(state.next_bid)
        split = [0]
        phase_now = self.schedule.phase_of(t)
        overrotate = bool(self.overrotations) and gate.kind in X_GATES

        def unflip(b: Branch, data: tuple[int, int]) -> Branch:
            k, old = data
            slots = list(b.slots)
            slots[k] = slots[k]._replace(s=old)
            return b.copy_with(slots=tuple(slots))

        def apply(br: Branch) -> list[Branch]:
            nonlocal expected
            new, fired_edges, br_changes, xflips, xvac = self._fire_branch(ctx, br)
            if fired_edges:
                fired_in.append(br.bid)
                edges.update(fired_edges)
                expected += abs(br.amp) ** 2 * len(fired_edges)
            for k, old, new_s, ghost in br_changes:
                rec: dict[str, Any] = {"b": br.bid, "k": k, "from": old, "to": new_s}
                if ghost:
                    rec["ghost"] = True
                changes.append(rec)
            if not (overrotate and fired_edges):
                return [new]
            # Over-rotation (D30): each flipped target keeps its colour with −i sin θ.
            factor = 1 + 0j
            for l in xvac:
                factor *= cmath.exp(-1j * self._theta(gate, 0, l, phase_now)[1])
            alts: list[tuple[complex, Any, complex]] = []
            for l, k, old_s, _new_s in xflips:
                theta = self._theta(gate, self.rules.tree(old_s), l, phase_now)[0]
                if theta:
                    alts.append((complex(math.cos(theta)), (k, old_s), -1j * math.sin(theta)))
            if not alts and factor == 1:
                return [new]
            out = self._expand(new.copy_with(amp=new.amp * factor), alts, unflip, alloc)
            split[0] += max(0, len(out) - 1)
            return out

        new_state = state.map(apply)
        new_state.next_bid = max(new_state.next_bid, next(alloc))
        if overrotate and split[0]:
            self.counters.noise_events["overrotation"] += 1
            events.append(
                {
                    "kind": "noise",
                    "model": "overrotation",
                    "gate": gate.id,
                    "new_branches": split[0],
                    "text": narration.overrotation_text(gate, split[0]),
                }
            )
        new_state = self._prune(new_state)
        phase = str(gate.phase)
        if fired_in:
            self.counters.activations[phase][str(gate.kind)] += 1
            self.counters.activations_expected[phase][str(gate.kind)] += expected
        fired_in.sort()
        events.append(
            {
                "kind": "gate",
                "gate": gate.id,
                "type": str(gate.kind),
                "level": gate.level,
                "phase": phase,
                "edges": [[gate.level, l] for l in sorted(edges)],
                "fired_in": fired_in,
                "changes": changes,
                "text": narration.gate_text(
                    gate, self.variant, fired_in, len(state), self.branch_names, changes
                ),
            }
        )
        failed = sorted(l for l, f in ctx.failed.items() if f)
        if failed:
            self.counters.noise_events["gate_failure"] += 1
            events.append(
                {
                    "kind": "noise",
                    "model": "gate_failure",
                    "gate": gate.id,
                    "edges": [[gate.level, l] for l in failed],
                    "text": narration.gate_failure_text(gate, failed),
                }
            )
        flipped = sorted(l for l, f in ctx.flipped.items() if f)
        if flipped:
            self.counters.noise_events["copy_error"] += 1
            events.append(
                {
                    "kind": "noise",
                    "model": "copy_error",
                    "gate": gate.id,
                    "edges": [[gate.level, l] for l in flipped],
                    "text": narration.copy_error_text(gate, self.variant, flipped),
                }
            )
        events.extend(ctx.strays)
        if self.kraus_channels:
            new_state = self._noise_after_gate(ctx, new_state, events)
        return new_state

    def _fire_branch(
        self, ctx: _Firing, br: Branch
    ) -> tuple[
        Branch,
        list[int],
        list[tuple[int, str, str, bool]],
        list[tuple[int, int, int, int]],
        list[int],
    ]:
        """Apply one gate instance to one branch (every edge of its level).

        Also returns, for coherent over-rotation, the colour flips of present targets
        ``(edge, slot, old, new)`` and one entry per empty X̂ target (its edge)."""
        gate = ctx.gate
        level = gate.level
        kind = gate.kind
        if br.collided:
            return br, [], [], [], []
        rules = self.rules
        # Sites are keyed by (tree, branch, site): the tree is the rail of a dual-rail
        # walker and 0 otherwise; a gate acts on the tree of its control.
        occ = {
            (rules.tree(w.s), w.branch, w.site): k
            for k, w in enumerate(br.slots)
            if w.level == level
        }
        if self.strict:
            self._check_window(gate, br, occ, ctx.tau, before=True)
        # physical occupants: present slot walkers (k ≥ 0) and strays (−1 − index)
        phys: dict[tuple[int, int, int], int] = {
            (rules.tree(w.s), w.branch, w.site): k
            for k, w in enumerate(br.slots)
            if br.present[k] and w.level == level
        }
        for i, st in enumerate(br.strays):
            if st.w.level == level:
                phys[(rules.tree(st.w.s), st.w.branch, st.w.site)] = -1 - i
        controls: list[tuple[int, int, int | None]]
        if kind is GateKind.COPY_CELL:
            controls = [(rules.copy_tree(), l, None) for l in sorted(br.cells_on)]
        elif kind in LANE_GATES:
            # uncontrolled cell elements: present in every lane, they act on every walker
            # of their window sites whatever its tree
            lanes = sorted({l for (_, l, site) in phys if site in gate.target_sites})
            controls = [(-1, l, None) for l in lanes]
        else:
            controls = sorted(
                (tree, l, who) for (tree, l, site), who in phys.items() if site == gate.control_site
            )
        if not controls:
            return br, [], [], [], []
        slots = list(br.slots)
        present = list(br.present)
        strays = list(br.strays)
        cells = set(br.cells_on)
        fired: list[int] = []
        changes: list[tuple[int, str, str, bool]] = []
        xflips: list[tuple[int, int, int, int]] = []
        xvac: list[int] = []

        def state_of(who: int) -> int:
            return slots[who].s if who >= 0 else strays[-1 - who].w.s

        def set_state(k: int, table: Any) -> None:
            old = slots[k].s
            new = table[old]
            if rules.is_vacuum(new):
                present[k] = False  # the record stays as the ghost, last colour kept
            elif new != old:
                slots[k] = slots[k]._replace(s=new)
            if new != old:
                changes.append((k, self._short(old), self._short(new), False))
                if kind in X_GATES:
                    xflips.append((l, k, old, new))

        for tree, l, who in controls:
            control = None if who is None else state_of(who)
            if control is not None and not rules.active(kind, control):
                continue
            if self._channels("gate_failure") and self._gate_failed(ctx, l):
                continue
            if kind in (GateKind.CELL_ON, GateKind.CELL_OFF):
                fired.append(l)
                cells.symmetric_difference_update({l})
                continue
            n_changes = len(changes)
            for idx, site in enumerate(gate.target_sites):
                bit = None
                if gate.target_bits:
                    bit = self.memory[l - 1][gate.target_bits[idx] - 1]
                    copy_noise = kind in COPY_GATES and bool(self._channels("copy_error"))
                    if copy_noise and self._copy_flipped(ctx, l):
                        bit = 1 - bit
                table = rules.target_table(kind, control, bit)
                if kind in LANE_GATES:
                    for (_, l2, s2), k in list(phys.items()):
                        if l2 == l and s2 == site and k >= 0:
                            set_state(k, table)
                    continue
                target = phys.get((tree, l, site))
                if target is not None and target >= 0:
                    set_state(target, table)
                    continue
                if target is not None:  # a stray walker on the target site
                    i = -1 - target
                    st = strays[i]
                    new = table[st.w.s]
                    if new == EMPTY:
                        strays[i] = st._replace(k=-99)  # removed below
                    else:
                        strays[i] = Stray(st.k, st.w._replace(s=new))
                    continue
                if not rules.has_vacuum:
                    # No walker on this tree: nothing to act on, and a copy cannot create one
                    # (D35). The ghost of a lost walker follows X̂ like any other (rendering).
                    k_ghost = occ.get((tree, l, site))
                    if kind in X_GATES and k_ghost is not None and not present[k_ghost]:
                        g_old = slots[k_ghost].s
                        if table[g_old] != g_old:
                            slots[k_ghost] = slots[k_ghost]._replace(s=table[g_old])
                            changes.append(
                                (k_ghost, self._short(g_old), self._short(table[g_old]), True)
                            )
                    continue
                new = table[EMPTY]
                if new == EMPTY:
                    if table is X_TABLE:
                        xvac.append(l)
                    k_ghost = occ.get((tree, l, site))
                    if k_ghost is not None and not present[k_ghost] and table is X_TABLE:
                        # Ghost rule (PROTOCOL.md §4.6): ghosts on target sites follow X̂.
                        g_old = slots[k_ghost].s
                        slots[k_ghost] = slots[k_ghost]._replace(s=X_TABLE[g_old])
                        changes.append(
                            (k_ghost, self._short(g_old), self._short(X_TABLE[g_old]), True)
                        )
                    continue
                # Creation on an empty site (DECISION D21): the walker belongs to the
                # site's time bin, fixed by the clock; it becomes that slot if the slot
                # is empty, otherwise a stray walker.
                k_bin = ctx.tau - self.geometry.X(level, site)
                walker = Walker(new, level, l, site, ctx.direction)
                if 0 <= k_bin < self.variant.K and not present[k_bin]:
                    present[k_bin] = True
                    slots[k_bin] = walker
                    changes.append((k_bin, "E", self._short(new), False))
                else:
                    k_bin = k_bin if 0 <= k_bin < self.variant.K else -1
                    strays.append(Stray(k_bin, walker))
                    ctx.strays.append(
                        {
                            "kind": "stray",
                            "gate": gate.id,
                            "b": br.bid,
                            "bin": k_bin,
                            "pos": [level, l, site],
                            "text": narration.stray_text(
                                gate,
                                self.variant,
                                k_bin,
                                (level, l, site),
                                self.branch_names.get(br.bid, str(br.bid)),
                            ),
                        }
                    )
            if kind in LANE_GATES:
                if len(changes) > n_changes:  # a passive element "fires" where it acts
                    fired.append(l)
            else:
                fired.append(l)
        if not fired:
            return br, [], [], [], []
        new_br = br.copy_with(
            slots=tuple(slots),
            present=tuple(present),
            cells_on=frozenset(cells),
            strays=tuple(st for st in strays if st.k != -99),
        )
        if self.strict:
            occ_new = {
                (rules.tree(w.s), w.branch, w.site): k
                for k, w in enumerate(new_br.slots)
                if w.level == level
            }
            self._check_window(gate, new_br, occ_new, ctx.tau, before=False)
        return new_br, fired, changes, xflips, xvac

    # -- noise hooks -------------------------------------------------------------------

    def _apply_kraus(
        self,
        state: SparseState,
        location: str,
        t: int,
        events: list[Event],
        mask_for: Any,
        gate: GateInstance | None = None,
    ) -> SparseState:
        phase = self.schedule.phase_of(t)
        for ch in self.kraus_channels:
            if location not in ch.where or str(phase) not in ch.phases:
                continue
            if gate is not None and ch.gates is not None and str(gate.kind) not in ch.gates:
                continue
            for k in sorted(ch.targets):
                mask = mask_for(k)
                if mask is None:
                    continue
                state, jump = apply_channel(state, ch, k, mask, self.rng)
                if jump is not None:
                    self.counters.noise_events[ch.model] += 1
                    events.append(
                        {
                            "kind": "noise",
                            "model": ch.model,
                            "where": location,
                            "k": k,
                            "op": jump.op,
                            "branches": list(jump.branches),
                            "p": jump.probability,
                            "text": narration.noise_text(
                                ch,
                                jump.op,
                                self.variant.slots[k],
                                location,
                                jump.branches,
                                len(state),
                                self.branch_names,
                            ),
                        }
                    )
        return state

    def _noise_after_gate(
        self, ctx: _Firing, state: SparseState, events: list[Event]
    ) -> SparseState:
        gate = ctx.gate
        location = self._location(gate)
        window = set(gate.window)

        def mask_for(k: int) -> Any:
            clock_level, clock_site = self._clock_pos(k, ctx.tau)
            clock_in = clock_level == gate.level and clock_site in window

            def mask(br: Branch) -> bool:
                if br.present[k]:
                    w = br.slots[k]
                    return w.level == gate.level and w.site in window
                return clock_in

            return mask

        return self._apply_kraus(state, location, ctx.t, events, mask_for, gate)

    def _crossing(self, level: int, site: int, direction: int) -> bool:
        if direction > 0:
            return 1 <= level <= self.geometry.n and site == self._sites[level]
        return level >= 2 and site == 1

    def _move_with_noise(
        self, t: int, phase: Phase, state: SparseState, events: list[Event]
    ) -> SparseState:
        if self.kraus_channels:
            tau = self._tau(t, Stage.START)
            direction = self._direction(t)

            def crossing_mask(k: int) -> Any:
                cl, cs = self._clock_pos(k, tau)
                clock_crossing = self._crossing(cl, cs, direction)

                def mask(br: Branch) -> bool:
                    if br.present[k]:
                        w = br.slots[k]
                        return self._crossing(w.level, w.site, w.dir)
                    return clock_crossing

                return mask

            state = self._apply_kraus(state, "scattering", t, events, crossing_mask)
        state = self._move(t, phase, state, events)
        if self.kraus_channels:
            tau = self._tau(t, Stage.POST_MOVE)

            def inside_mask(k: int) -> Any:
                clock_inside = self._clock_pos(k, tau)[0] >= 1

                def mask(br: Branch) -> bool:
                    if br.present[k]:
                        return br.slots[k].level >= 1
                    return clock_inside

                return mask

            state = self._apply_kraus(state, "propagation", t, events, inside_mask)
        return self._collisions(t, state, events)

    def _noise_idle(self, t: int, state: SparseState, events: list[Event]) -> SparseState:
        if not self.kraus_channels:
            return state
        tau = self.schedule.T_fwd

        def inside_mask(k: int) -> Any:
            clock_inside = self._clock_pos(k, tau)[0] >= 1

            def mask(br: Branch) -> bool:
                return br.slots[k].level >= 1 if br.present[k] else clock_inside

            return mask

        return self._apply_kraus(state, "idle", t, events, inside_mask)

    def _empty_aux_rail(self, t: int, state: SparseState, events: list[Event]) -> SparseState:
        """A walker still on the auxiliary rail when the query ends has no way back: it leaves
        the system at the cell, like one past the end of a lane (DECISIONS D29, D35)."""
        left: dict[int, list[int]] = defaultdict(list)

        def clear(br: Branch) -> list[Branch]:
            stuck = [
                k
                for k, (w, p) in enumerate(zip(br.slots, br.present, strict=True))
                if p and self.rules.tree(w.s) == 2
            ]
            if not stuck:
                return [br]
            slots = list(br.slots)
            present = list(br.present)
            lost = list(br.lost)
            for k in stuck:
                present[k] = False
                lost.append((k, slots[k].branch, t, slots[k].s))
                slots[k] = slots[k]._replace(s=self.rules.ghost_of_aux())
                left[k].append(br.bid)
            return [br.copy_with(slots=tuple(slots), present=tuple(present), lost=tuple(lost))]

        new_state = state.map(clear)
        n_br = len(state)
        for k, bids in sorted(left.items()):
            events.append(
                {
                    "kind": "absorb",
                    "k": k,
                    "branches": bids,
                    "text": narration.aux_left_text(self.variant.slots[k], len(bids), n_br),
                }
            )
        return new_state

    def _collisions(self, t: int, state: SparseState, events: list[Event]) -> SparseState:
        """Freeze branches where two walkers share a site (DECISION D26)."""
        hits: list[dict[str, Any]] = []

        def check(br: Branch) -> list[Branch]:
            if br.collided:
                return [br]
            seen: dict[tuple[int, int, int, int], str] = {}
            tree = self.rules.tree
            for k, (w, p) in enumerate(zip(br.slots, br.present, strict=True)):
                if p and w.level >= 1:
                    pos = (tree(w.s), w.level, w.branch, w.site)
                    if pos in seen:
                        hits.append(
                            {
                                "b": br.bid,
                                "pos": list(pos[1:]),
                                "who": [seen[pos], self.variant.slots[k].label],
                            }
                        )
                        return [br.copy_with(collided=True)]
                    seen[pos] = self.variant.slots[k].label
            for st in br.strays:
                w = st.w
                if w.level < 1:
                    continue
                pos = (tree(w.s), w.level, w.branch, w.site)
                if pos in seen:
                    hits.append({"b": br.bid, "pos": list(pos[1:]), "who": [seen[pos], "stray"]})
                    return [br.copy_with(collided=True)]
                seen[pos] = "stray"
            return [br]

        if not any(br.strays for br in state) and not self.active:
            return state  # ideal runs keep the train order: no collision possible
        new_state = state.map(check)
        for h in hits:
            events.append(
                {
                    "kind": "collision",
                    "b": h["b"],
                    "pos": h["pos"],
                    "text": narration.collision_text(
                        h["who"], tuple(h["pos"]), self.branch_names.get(h["b"], str(h["b"]))
                    ),
                }
            )
        return new_state

    # -- motion --------------------------------------------------------------------

    def _step(self, w: Walker) -> tuple[Walker, int]:
        """Move one walker (or ghost) one site along its direction."""
        s, level, branch, site, d = w
        if d > 0:
            if level == PORT_LEVEL:
                if site < 0:
                    return Walker(s, level, branch, site + 1, d), _NONE
                return Walker(s, 1, 1, 1, d), _INJECT
            if site < self._sites[level]:
                return Walker(s, level, branch, site + 1, d), _NONE
            if level == self._lane:
                return w, _ABSORB  # leaves the system at the cell (DECISION D29)
            s_out, port = self.rules.scatter_fwd(s)
            child = 2 * branch - 1 if port is Port.LEFT else 2 * branch
            return Walker(s_out, level + 1, child, 1, +1), _S_FWD
        if level == PORT_LEVEL:
            return Walker(s, level, branch, site - 1, d), _NONE
        if site > 1:
            return Walker(s, level, branch, site - 1, d), _NONE
        if level == 1:
            return Walker(s, PORT_LEVEL, 1, 0, d), _EXIT
        from_left = branch % 2 == 1
        parent = (branch + 1) // 2
        s_out, port = self.rules.scatter_bwd(s, Port.LEFT if from_left else Port.RIGHT)
        if port is Port.PARENT:
            return Walker(s_out, level - 1, parent, self._sites[level - 1], -1), _S_UP
        sibling = 2 * parent - 1 if port is Port.LEFT else 2 * parent
        return Walker(s_out, level, sibling, 1, +1), _S_BOUNCE

    def _imbalance_alternative(
        self, w: Walker, nw: Walker, what: int, phase: Phase
    ) -> tuple[complex, Walker, complex] | None:
        """The other output of an imbalanced bifurcation (D30): (main coefficient,
        alternative walker, alternative coefficient), or None if the node is balanced."""
        if what == _S_FWD:
            phi, _ = self._phi(self.rules.tree(w.s), w.level, w.branch, phase)
            if not phi:
                return None
            other = 2 * w.branch if nw.branch == 2 * w.branch - 1 else 2 * w.branch - 1
            alt = Walker(nw.s, w.level + 1, other, 1, +1)
            return complex(math.cos(phi)), alt, 1j * math.sin(phi)
        parent = (w.branch + 1) // 2
        phi, mode = self._phi(self.rules.tree(w.s), w.level - 1, parent, phase)
        if not phi:
            return None
        # Backward crossing: the ports are mixed first (M for a reciprocal device, the
        # default, DECISION D31; M† for the adjoint of the forward crossing), then Ŝ† acts.
        other_port = Port.RIGHT if w.branch % 2 == 1 else Port.LEFT
        s_out, port = self.rules.scatter_bwd(w.s, other_port)
        if port is Port.PARENT:
            alt = Walker(s_out, w.level - 1, parent, self._sites[w.level - 1], -1)
        else:
            sibling = 2 * parent - 1 if port is Port.LEFT else 2 * parent
            alt = Walker(s_out, w.level, sibling, 1, +1)
        sign = -1j if mode == "adjoint" else 1j
        return complex(math.cos(phi)), alt, sign * math.sin(phi)

    def _move(self, t: int, phase: Phase, state: SparseState, events: list[Event]) -> SparseState:
        crossings: dict[tuple[int, int], list[dict[str, Any]]] = defaultdict(list)
        weight: dict[str, float] = defaultdict(float)
        alloc = itertools.count(state.next_bid)
        split = [0]

        def relocate(b: Branch, data: tuple[int, Walker]) -> Branch:
            k, w = data
            slots = list(b.slots)
            slots[k] = w
            return b.copy_with(slots=tuple(slots))

        def apply(br: Branch) -> list[Branch]:
            if br.collided:
                return [br]
            new_slots = []
            present = list(br.present)
            p2 = abs(br.amp) ** 2
            alts: list[tuple[complex, Any, complex]] = []
            lost = list(br.lost)
            for k, w in enumerate(br.slots):
                nw, what = self._step(w)
                new_slots.append(nw)
                if what == _NONE or not br.present[k]:
                    continue
                if self.imbalances and what in (_S_FWD, _S_UP, _S_BOUNCE):
                    alt = self._imbalance_alternative(w, nw, what, phase)
                    if alt is not None:
                        alts.append((alt[0], (k, alt[1]), alt[2]))
                if what == _ABSORB:
                    if not self.active and not br.strays:
                        raise EngineError(
                            f"a walker ran past the end of memory lane ({w.level},{w.branch})"
                        )
                    present[k] = False
                    lost.append((k, w.branch, t, w.s))
                    crossings[(k, _ABSORB)].append(
                        {
                            "b": br.bid,
                            "from_s": self._short(w.s),
                            "to_s": "E",
                            "at": [w.level, w.branch],
                        }
                    )
                    continue
                if self.strict and what == _S_BOUNCE:
                    raise InvariantViolation(
                        f"tick {t}: slot {k} reached bifurcation ({w.level - 1},"
                        f"{(w.branch + 1) // 2}) blue while moving backward (branch {br.bid})"
                    )
                rec: dict[str, Any] = {
                    "b": br.bid,
                    "from_s": self._short(w.s),
                    "to_s": self._short(nw.s),
                }
                if what in (_S_FWD, _S_UP, _S_BOUNCE):
                    node = (
                        [w.level, w.branch]
                        if what == _S_FWD
                        else [w.level - 1, (w.branch + 1) // 2]
                    )
                    rec |= {"node": node, "from": [w.level, w.branch], "to": [nw.level, nw.branch]}
                    weight["bounce" if what == _S_BOUNCE else str(phase)] += p2
                crossings[(k, what)].append(rec)
            strays = []
            for st in br.strays:
                nw, what = self._step(st.w)
                if what == _ABSORB:
                    # it leaves the system at the cell; the record (slot code −1000 − bin)
                    # keeps the branch orthogonal to those that never had the stray
                    lost.append((-1000 - st.k, st.w.branch, t, st.w.s))
                else:
                    strays.append(Stray(st.k, nw))
            moved = br.copy_with(
                slots=tuple(new_slots),
                present=tuple(present),
                strays=tuple(strays),
                lost=tuple(lost),
            )
            if not alts:
                return [moved]
            out = self._expand(moved, alts, relocate, alloc)
            split[0] += max(0, len(out) - 1)
            return out

        new_state = state.map(apply)
        new_state.next_bid = max(new_state.next_bid, next(alloc))
        if split[0]:
            self.counters.noise_events["beam_splitter_imbalance"] += 1
            events.append(
                {
                    "kind": "noise",
                    "model": "beam_splitter_imbalance",
                    "new_branches": split[0],
                    "text": narration.imbalance_text(split[0]),
                }
            )
        new_state = self._prune(new_state)
        for key, w8 in weight.items():
            if key == "bounce":
                self.counters.bounces += w8
            else:
                self.counters.crossings[key] += w8
        n_br = len(state)
        for (k, what), recs in sorted(crossings.items()):
            slot = self.variant.slots[k]
            if what == _INJECT:
                events.append(
                    {
                        "kind": "inject",
                        "k": k,
                        "branches": [r["b"] for r in recs],
                        "text": narration.inject_text(slot, len(recs), n_br),
                    }
                )
            elif what == _EXIT:
                events.append(
                    {
                        "kind": "exit",
                        "k": k,
                        "branches": [r["b"] for r in recs],
                        "text": narration.exit_text(slot, len(recs), n_br),
                    }
                )
            elif what == _ABSORB:
                events.append(
                    {
                        "kind": "absorb",
                        "k": k,
                        "branches": [r["b"] for r in recs],
                        "text": narration.absorb_text(slot, len(recs), n_br),
                    }
                )
            else:
                direction = {_S_FWD: "fwd", _S_UP: "bwd", _S_BOUNCE: "bounce"}[what]
                events.append(
                    {
                        "kind": "scatter",
                        "k": k,
                        "dir": direction,
                        "crossings": recs,
                        "text": narration.scatter_text(
                            slot, direction, recs, n_br, self.branch_names
                        ),
                    }
                )
        return new_state

    # -- events --------------------------------------------------------------------

    def _memory_flip_event(self) -> Event:
        return {
            "kind": "noise",
            "model": "memory_bit_flip",
            "flips": self.memory_flips,
            "text": narration.memory_flip_text(self.memory_flips),
        }

    def _phase_event(self, phase: Phase | None) -> Event:
        name = "done" if phase is None else str(phase)
        return {
            "kind": "phase",
            "phase": name,
            "text": narration.phase_text(name, self.variant, self.schedule),
        }

    # -- strict-mode invariants (PROTOCOL.md §8.2) ------------------------------------

    def _check_positions(self, state: SparseState, t_start: int) -> None:
        """Ideal timing: at the start of forward tick ``t`` slot ``k`` is at ``x = t − k``."""
        geo = self.geometry
        offset = self.variant.offset
        for br in state:
            seen: set[tuple[int, int, int, int]] = set()
            for k, w in enumerate(br.slots):
                pos = (self.rules.tree(w.s), w.level, w.branch, w.site)
                if pos in seen:
                    raise InvariantViolation(f"two slots share site {pos} (branch {br.bid})")
                seen.add(pos)
                x = geo.X(w.level, w.site)
                if x != t_start - offset(k):
                    raise InvariantViolation(
                        f"slot {k} at x = {x}, expected {t_start - offset(k)} (branch {br.bid}): "
                        "train order or timing broken"
                    )

    def _check_window(
        self,
        gate: GateInstance,
        br: Branch,
        occ: dict[tuple[int, int, int], int],
        tau: int,
        *,
        before: bool,
    ) -> None:
        """The window holds the slots the schedule expects (the clock puts slot ``k`` at
        ``x = τ − offset(k)``), and the walkers an X̂ gate meets are red."""
        expected = set(gate.target_slots)
        if gate.control_slot is not None:
            expected.add(gate.control_slot)
        sites = set(gate.window)
        offset = self.variant.offset
        # slots sharing a path coordinate (the two backups of a dual-rail carrier) are
        # interchangeable here: each sits on its own tree
        expected_x = {offset(k) for k in expected}
        for (_, l, site), k in occ.items():
            if site not in sites:
                continue
            clock_ok = self.geometry.X(gate.level, site) == tau - offset(k)
            listed = not expected or offset(k) in expected_x or gate.kind in LANE_GATES
            if not clock_ok or not listed:
                raise InvariantViolation(
                    f"{gate.id} at tick {gate.tick}: slot {k} found on window site "
                    f"({gate.level},{l},{site}), expected one of {sorted(expected)} "
                    f"(branch {br.bid})"
                )
        if gate.kind not in X_GATES:
            return
        check_red = (before and gate.phase is Phase.ROUTING) or (
            not before and gate.phase is Phase.INVERSE
        )
        if not check_red:
            return
        # Û⁽ᵈ⁾ and Û_in: the whole window is red; Û_B: its targets (the control backup may
        # legitimately be blue: it carries the bit along the train).
        red_sites = sites if gate.kind is not GateKind.U_B else set(gate.target_sites)
        for (_, l, site), k in occ.items():
            if site in red_sites and br.present[k] and self.rules.colour(br.slots[k].s) != RED:
                when = "before" if before else "after"
                raise InvariantViolation(
                    f"{gate.id} ({gate.phase}): slot {k} on ({gate.level},{l},{site}) is not red "
                    f"{when} the gate (branch {br.bid}); walkers may be blue only between "
                    "an address-transmission gate and the next scattering"
                )

    def _check_lanes(self, state: SparseState, t: int) -> None:
        always = self.variant.always_present()
        # the dual-rail copy and output circuit make data walkers blue during the query;
        # every walker must be red again when the query ends
        sched = self.schedule
        blue_ok = sched.phase_of(t) is Phase.QUERY and t != sched.T_fwd + sched.T_q - 1
        for br in state:
            for k in always:
                if not br.present[k]:
                    raise InvariantViolation(
                        f"tick {t}: slot {k} ({self.variant.slots[k].name}) is missing "
                        f"(branch {br.bid}); flags and backups are always present"
                    )
            if blue_ok:
                continue
            for k, w in enumerate(br.slots):
                if br.present[k] and w.level == self._lane and self.rules.colour(w.s) == BLUE:
                    raise InvariantViolation(
                        f"tick {t}: slot {k} blue in memory lane {w.branch} (branch {br.bid})"
                    )

    def _check_switches_off(self, state: SparseState) -> None:
        for br in state:
            if br.cells_on:
                raise InvariantViolation(
                    f"cell switches {sorted(br.cells_on)} still on at the end of the query "
                    f"(branch {br.bid})"
                )

    def _check_final(self, state: SparseState) -> None:
        for br in state:
            for k, w in enumerate(br.slots):
                if br.present[k] and (w.level != PORT_LEVEL or self.rules.colour(w.s) != RED):
                    raise InvariantViolation(
                        f"slot {k} did not exit red through the port (branch {br.bid})"
                    )
