"""Clock schedule: gate instances, phases and time reversal (PROTOCOL.md §4.2–4.4).

A gate instance is a gate placed on a window of sites of *every* edge of one level
(or every memory lane) and fired by the global clock at one tick. The forward
schedule comes from the ideal slot timing ``x(k, t) = t − k`` (slot ``k`` stands on
site ``s`` of level ``d`` at the start of tick ``X(d, s) + k``). The inverse-routing
schedule is the exact time reversal of the forward one (DECISION D2): the instance
fired at forward tick ``t`` fires again at ``T_fwd + T_q + (T_fwd − 1 − t)`` with the
order within a tick reversed.

Tick ranges: routing ``0..T_fwd−1``, query ``T_fwd..T_fwd+T_q−1``, inverse
``T_fwd+T_q..2·T_fwd+T_q−1``.
"""

from __future__ import annotations

from collections import defaultdict
from dataclasses import dataclass, field, replace
from enum import StrEnum

from .gates import GateKind


class Phase(StrEnum):
    ROUTING = "routing"
    QUERY = "query"
    INVERSE = "inverse"


@dataclass(frozen=True)
class GateInstance:
    """A clock-scheduled gate on one window of every edge of a level.

    ``control_site`` is the site of the controlling walker (``None`` for Û_copy(F),
    controlled by the cell switch). ``target_bits`` gives, for copy gates, the data
    index ``j`` of the memory qubit ``M_j`` beside each target site.
    ``control_slot`` / ``target_slots`` name the slots expected on the window in the
    ideal protocol (narration and strict-mode checks only).
    """

    id: str
    kind: GateKind
    level: int
    control_site: int | None
    target_sites: tuple[int, ...]
    tick: int
    order: int = 0
    phase: Phase = Phase.ROUTING
    label: str = ""
    target_bits: tuple[int, ...] = ()
    control_slot: int | None = None
    target_slots: tuple[int, ...] = ()

    @property
    def window(self) -> tuple[int, ...]:
        """Window sites, control first."""
        head = () if self.control_site is None else (self.control_site,)
        return head + self.target_sites


def time_reverse(
    forward: tuple[GateInstance, ...], T_fwd: int, T_q: int
) -> tuple[GateInstance, ...]:
    """Inverse-routing instances: forward instances replayed backward in time."""
    by_tick: dict[int, list[GateInstance]] = defaultdict(list)
    for g in forward:
        if not 0 <= g.tick < T_fwd:
            raise ValueError(f"forward gate {g.id} at tick {g.tick} outside 0..{T_fwd - 1}")
        by_tick[g.tick].append(g)
    out: list[GateInstance] = []
    for t, gates in by_tick.items():
        t_inv = T_fwd + T_q + (T_fwd - 1 - t)
        ordered = sorted(gates, key=lambda g: g.order, reverse=True)
        out.extend(
            replace(g, tick=t_inv, order=i, phase=Phase.INVERSE) for i, g in enumerate(ordered)
        )
    return tuple(sorted(out, key=lambda g: (g.tick, g.order)))


@dataclass(frozen=True)
class Schedule:
    forward: tuple[GateInstance, ...]
    query: tuple[GateInstance, ...]
    inverse: tuple[GateInstance, ...]
    T_fwd: int
    T_q: int
    _by_tick: dict[int, tuple[GateInstance, ...]] = field(
        default_factory=dict, compare=False, repr=False
    )

    @property
    def T_total(self) -> int:
        return 2 * self.T_fwd + self.T_q

    def phase_of(self, t: int) -> Phase:
        if t < self.T_fwd:
            return Phase.ROUTING
        if t < self.T_fwd + self.T_q:
            return Phase.QUERY
        return Phase.INVERSE

    def mirror(self, t: int) -> int:
        """Inverse-phase tick replaying forward tick ``t``."""
        return self.T_fwd + self.T_q + (self.T_fwd - 1 - t)

    def gates_at(self, t: int) -> tuple[GateInstance, ...]:
        return self._by_tick.get(t, ())

    def all(self) -> tuple[GateInstance, ...]:
        return self.forward + self.query + self.inverse

    def max_instances_per_tick(self) -> int:
        return max((len(v) for v in self._by_tick.values()), default=0)


def build_schedule(
    forward: list[GateInstance], query: list[GateInstance], T_fwd: int, T_q: int
) -> Schedule:
    """Assemble the three phases; the inverse phase is the time reversal of routing."""
    fwd = tuple(sorted(forward, key=lambda g: (g.tick, g.order)))
    for g in query:
        if not T_fwd <= g.tick < T_fwd + T_q:
            raise ValueError(f"query gate {g.id} at tick {g.tick} outside the query phase")
    qry = tuple(sorted(query, key=lambda g: (g.tick, g.order)))
    inv = time_reverse(fwd, T_fwd, T_q)
    by_tick: dict[int, list[GateInstance]] = defaultdict(list)
    for g in fwd + qry + inv:
        by_tick[g.tick].append(g)
    frozen = {t: tuple(sorted(v, key=lambda g: g.order)) for t, v in by_tick.items()}
    return Schedule(fwd, qry, inv, T_fwd, T_q, frozen)


def retime(schedule: Schedule, shifts: dict[int, int]) -> Schedule:
    """Copy of ``schedule`` with instance ``i`` of ``schedule.all()`` moved by
    ``shifts[i]`` ticks (clock jitter), clamped to the run."""
    if not shifts:
        return schedule
    last = schedule.T_total - 1
    moved = [
        replace(g, tick=min(last, max(0, g.tick + shifts.get(i, 0))))
        for i, g in enumerate(schedule.all())
    ]
    nf, nq = len(schedule.forward), len(schedule.query)
    fwd, qry, inv = tuple(moved[:nf]), tuple(moved[nf : nf + nq]), tuple(moved[nf + nq :])
    by_tick: dict[int, list[GateInstance]] = defaultdict(list)
    for g in moved:
        by_tick[g.tick].append(g)
    frozen = {t: tuple(sorted(v, key=lambda g: (g.order, g.id))) for t, v in by_tick.items()}
    return Schedule(fwd, qry, inv, schedule.T_fwd, schedule.T_q, frozen)
