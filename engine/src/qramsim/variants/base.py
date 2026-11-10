"""Variant interface (PROTOCOL.md §5, DESIGN.md §1.5).

A variant is a configuration of the shared machinery: it supplies the slots, the
encoding, the edge lengths, the clock schedule, the ideal output and the readout.
The tick loop, the state, the mover and the time reversal are shared.
"""

from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import Any, ClassVar

from ..alphabet import RED, Family
from ..config import ConfigError, InputTerm, RunConfig
from ..geometry import PORT_LEVEL, Geometry
from ..rules import Rules
from ..schedule import GateInstance, Schedule, build_schedule
from ..state import Branch, SparseState, Walker
from ..train import Slot


@dataclass(frozen=True)
class Readout:
    """Decoded output of one branch.

    ``well_formed`` holds when every present walker has exited through the port in its
    slot position, red, with the flag walkers present and all cell switches off.
    """

    address: str
    data: tuple[int, ...]
    well_formed: bool
    # Slots with no walker in the particle-conserving variants (a heralded loss, D35); their
    # bit reads 0 above, and the output is not well formed.
    erased: tuple[str, ...] = ()


class Variant(ABC):
    name: ClassVar[str]
    family: ClassVar[Family]

    def __init__(self, config: RunConfig) -> None:
        self.config = config
        self.n = config.n
        self.m = config.m
        self.copy_mode = config.copy_mode
        self.warnings: list[str] = []
        self.rules: Rules = self.make_rules()
        self.slots: tuple[Slot, ...] = self.build_slots()
        self.K = len(self.slots)
        self.span = 1 + max(self.offset(k) for k in range(self.K))
        self.geometry = Geometry(self.n, self.edge_lengths())

    # -- to implement ----------------------------------------------------------------

    @abstractmethod
    def build_slots(self) -> tuple[Slot, ...]: ...

    @abstractmethod
    def default_sites(self, d: int) -> int:
        """Default ``n_sites(d)`` for ``d = 1..n`` (the memory lane is handled here)."""

    @abstractmethod
    def encode(self, address: str) -> tuple[int, ...]:
        """Local state of every slot for a classical address (``E`` = empty)."""

    @abstractmethod
    def forward_gates(self) -> list[GateInstance]: ...

    @abstractmethod
    def query_gates(self, T_fwd: int) -> tuple[list[GateInstance], int]:
        """Query-phase instances and ``T_q``."""

    @abstractmethod
    def output_states(self, address: str, data: tuple[int, ...]) -> tuple[int, ...]:
        """Ideal local state of every slot at the output for address and data."""

    @abstractmethod
    def readout(self, branch: Branch) -> Readout: ...

    @abstractmethod
    def paper_resources(self) -> dict[str, Any]:
        """Closed formulas of the paper for this variant (for comparison)."""

    @abstractmethod
    def gate_locations(self) -> dict[str, Any]:
        """Physical gate placements in the tree and the cells."""

    def make_rules(self) -> Rules:
        """Gate rules of the variant family (bosonic by default)."""
        return Rules()

    def always_present(self) -> tuple[int, ...]:
        """Slots that hold a walker in every branch at every tick (strict-mode check)."""
        return () if self.rules.has_vacuum else tuple(range(self.K))

    def offset(self, k: int) -> int:
        """Path offset of slot ``k``: in the ideal timing it stands at ``x = t − offset(k)``.
        Equal to ``k`` except in ``dualrail_backup``, whose two backups of a carrier share
        a path coordinate on the two trees."""
        return k

    def rest_site(self, k: int) -> int:
        """Lane site where slot ``k`` rests during the query (PROTOCOL.md §4.5)."""
        return self.span - self.offset(k)

    def present_state(self, s: int) -> bool:
        """Whether an encoded local state holds a walker (``∅`` only in bosonic variants)."""
        return not self.rules.is_vacuum(s)

    # -- shared --------------------------------------------------------------------

    def edge_lengths(self) -> tuple[int, ...]:
        overrides = self.config.options.n_sites
        sites = []
        for d in range(1, self.n + 1):
            sites.append(int(overrides.get(str(d), self.default_sites(d))))
        lane = int(overrides.get("memory", self.span))
        if lane < self.span:
            raise ConfigError(
                f"the memory lane needs at least {self.span} sites to host the train at rest; "
                f"got {lane}"
            )
        sites.append(lane)
        return tuple(sites)

    @property
    def T_fwd(self) -> int:
        """Tick at which the tail stands on site 1 of its memory lane."""
        return self.geometry.X(self.geometry.lane_level, 1) + self.span - 1

    def schedule(self) -> Schedule:
        T_fwd = self.T_fwd
        query, T_q = self.query_gates(T_fwd) if self.config.options.query else ([], 0)
        return build_schedule(self.forward_gates(), query, T_fwd, T_q)

    def memory_bits(self) -> tuple[tuple[int, ...], ...]:
        mem = self.config.memory
        if mem is None:
            raise ConfigError("resolve the configuration before building the variant")
        return mem

    def stored(self, address: str) -> tuple[int, ...]:
        return self.memory_bits()[self.geometry.cell_of_address(address) - 1]

    def initial_state(self, terms: tuple[InputTerm, ...]) -> SparseState:
        """Input superposition: slot ``k`` waits at port site ``−offset(k)``, moving forward."""
        branches = []
        for bid, term in enumerate(terms):
            states = self.encode(term.address)
            present = tuple(self.present_state(s) for s in states)
            slots = tuple(
                Walker(s if p else RED, PORT_LEVEL, 1, -self.offset(k), +1)
                for k, (s, p) in enumerate(zip(states, present, strict=True))
            )
            branches.append(Branch(term.amp, slots, present, frozenset(), bid))
        return SparseState(branches)

    def ideal_output(self, terms: tuple[InputTerm, ...]) -> SparseState:
        """``Σ_a α_a |a⟩_A |b^(a)⟩_D``, every walker exited, moving away from the tree."""
        branches = []
        for bid, term in enumerate(terms):
            data = self.stored(term.address) if self.config.options.query else (1,) * self.m
            states = self.output_states(term.address, data)
            present = tuple(self.present_state(s) for s in states)
            slots = tuple(
                Walker(s if p else RED, PORT_LEVEL, 1, -self.offset(k), -1)
                for k, (s, p) in enumerate(zip(states, present, strict=True))
            )
            branches.append(Branch(term.amp, slots, present, frozenset(), bid))
        return SparseState(branches)

    def describe(self) -> dict[str, Any]:
        """Static description for trajectory metadata."""
        geo = self.geometry
        return {
            "variant": self.name,
            "family": str(self.family),
            "copy_mode": self.copy_mode,
            "n": self.n,
            "m": self.m,
            "K": self.K,
            "span": self.span,
            "slots": [
                {
                    "k": s.index,
                    "name": s.name,
                    "label": s.label,
                    "role": str(s.role),
                    "register": s.register,
                    "backup": s.backup,
                    "bit": s.bit,
                    "offset": self.offset(s.index),
                    **({"rail": s.rail} if s.rail else {}),
                }
                for s in self.slots
            ],
            "geometry": {
                "levels": [{"d": d, "n_sites": geo.sites(d)} for d in range(1, self.n + 1)],
                "memory_sites": geo.sites(geo.lane_level),
                "trees": self.rules.trees,
                "cells": [
                    {"l": l, "address": geo.address_of_cell(l)} for l in range(1, geo.n_cells + 1)
                ],
            },
            "warnings": list(self.warnings),
        }
