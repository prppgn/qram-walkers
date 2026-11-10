"""Backup variant (technical paper, §Backup variant; arXiv appendix C; PROTOCOL.md §5.2).

Slots front→tail: ``A_1, Ã_1, A_2, Ã_2, …, A_n, Ã_n, D_1, D̃_1, …, D_m, D̃_m``, with
``K = 2(n+m)`` (``include_last_backup = false`` drops ``D̃_m``: ``K = 2(n+m) − 1``, the
arXiv count). Every walker starts red except the address walkers, encoded as in the
basic variant. The long-range Û⁽ᵈ⁾ is replaced by short-range gates on 4-site edges:
Û_in(Ã_d | A_d) once per level, then Û_B(W_{i+1}, W̃_{i+1} | W̃_i), activated by a **blue**
backup, once for every backup ``Ã_d … Ã_n, D̃_1 … D̃_{m−1}`` (``n + m − d`` firings,
DECISION D4). The schedule follows from the clock, and gates of consecutive levels
interleave in time: that is the paper's pipelining. The query is the local backup copy:
``D_j`` is copied under the control of the backup in front of it (``Ã_n`` for ``D_1``,
``D̃_{j−1}`` otherwise).
"""

from __future__ import annotations

from typing import Any, ClassVar

from ..alphabet import EMPTY, RED, Family
from ..gates import GateKind
from ..geometry import PORT_LEVEL
from ..schedule import GateInstance, Phase
from ..state import Branch
from ..train import Slot, SlotRole, backup_train
from .base import Readout, Variant

_SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")
EDGE_SITES = 4  # technical paper, §Depth reduction


def level_tag(d: int) -> str:
    return f"⁽{str(d).translate(_SUPERSCRIPT)}⁾"


class BackupVariant(Variant):
    name: ClassVar[str] = "backup"
    family: ClassVar[Family] = Family.BOSONIC

    def build_slots(self) -> tuple[Slot, ...]:
        return backup_train(self.n, self.m, self.config.options.include_last_backup)

    def default_sites(self, d: int) -> int:
        return EDGE_SITES

    def k_of(self, name: str) -> int:
        for s in self.slots:
            if s.name == name:
                return s.index
        raise KeyError(name)

    def encode(self, address: str) -> tuple[int, ...]:
        return tuple(
            (RED if address[s.bit - 1] == "1" else EMPTY) if s.role is SlotRole.ADDRESS else RED
            for s in self.slots
        )

    def output_states(self, address: str, data: tuple[int, ...]) -> tuple[int, ...]:
        states = []
        for s in self.slots:
            if s.role is SlotRole.ADDRESS:
                states.append(RED if address[s.bit - 1] == "1" else EMPTY)
            elif s.role is SlotRole.DATA:
                states.append(RED if data[s.bit - 1] else EMPTY)
            else:
                states.append(RED)
        return tuple(states)

    def always_present(self) -> tuple[int, ...]:
        return tuple(s.index for s in self.slots if s.backup)

    # -- schedule ----------------------------------------------------------------------

    def control_backups(self, d: int) -> list[Slot]:
        """Backups that control Û_B at level d: Ã_d … Ã_n, D̃_1 … D̃_{m−1}."""
        names = [f"At_{i}" for i in range(d, self.n + 1)] + [f"Dt_{j}" for j in range(1, self.m)]
        return [self.slots[self.k_of(x)] for x in names]

    def forward_gates(self) -> list[GateInstance]:
        geo = self.geometry
        gates: list[GateInstance] = []
        for d in range(1, self.n + 1):
            if geo.sites(d) < EDGE_SITES:
                raise ValueError(f"the backup gates need edges of at least {EDGE_SITES} sites")
            a, at = self.k_of(f"A_{d}"), self.k_of(f"At_{d}")
            gates.append(
                GateInstance(
                    id=f"Uin{d}",
                    kind=GateKind.U_IN,
                    level=d,
                    control_site=3,
                    target_sites=(2,),
                    tick=geo.X(d, 3) + a,
                    phase=Phase.ROUTING,
                    label=f"Û_in{level_tag(d)}",
                    control_slot=a,
                    target_slots=(at,),
                )
            )
            for ctrl in self.control_backups(d):
                k = ctrl.index
                gates.append(
                    GateInstance(
                        id=f"UB{d}:{ctrl.name}",
                        kind=GateKind.U_B,
                        level=d,
                        control_site=4,
                        target_sites=(3, 2),
                        tick=geo.X(d, 4) + k,
                        phase=Phase.ROUTING,
                        label=f"Û_B{level_tag(d)} [{ctrl.label}]",
                        control_slot=k,
                        target_slots=tuple(x for x in (k + 1, k + 2) if x < self.K),
                    )
                )
        return gates

    def query_gates(self, T_fwd: int) -> tuple[list[GateInstance], int]:
        lane = self.geometry.lane_level
        stagger = self.config.options.query_stagger
        gates = []
        for j in range(1, self.m + 1):
            ctrl = self.k_of(f"At_{self.n}" if j == 1 else f"Dt_{j - 1}")
            data = self.k_of(f"D_{j}")
            gates.append(
                GateInstance(
                    id=f"copy_D{j}",
                    kind=GateKind.COPY_BACKUP,
                    level=lane,
                    control_site=self.rest_site(ctrl),
                    target_sites=(self.rest_site(data),),
                    tick=T_fwd + (j - 1 if stagger else 0),
                    order=0 if stagger else j - 1,
                    phase=Phase.QUERY,
                    label=f"Û_copy [{self.slots[data].label} | {self.slots[ctrl].label}]",
                    target_bits=(j,),
                    control_slot=ctrl,
                    target_slots=(data,),
                )
            )
        return gates, (self.m if stagger else 1)

    # -- output ------------------------------------------------------------------------

    def readout(self, branch: Branch) -> Readout:
        address = []
        data = [0] * self.m
        ok = not branch.cells_on and not branch.strays and not branch.collided
        for slot, w, p in zip(self.slots, branch.slots, branch.present, strict=True):
            if p:
                exited = w.level == PORT_LEVEL and w.site == -slot.index and w.dir == -1
                ok = ok and exited and w.s == RED
            if slot.role is SlotRole.ADDRESS:
                address.append("1" if p else "0")
            elif slot.role is SlotRole.DATA:
                data[slot.bit - 1] = 1 if p else 0
            elif not p:  # a backup lost
                ok = False
        return Readout("".join(address), tuple(data), ok)

    def gate_locations(self) -> dict[str, Any]:
        nodes = (1 << self.n) - 1
        return {
            "U_in": nodes,
            "U_B": nodes,
            "S": nodes,
            "copy_per_cell": {str(GateKind.COPY_BACKUP): self.m},
            "cells": 1 << self.n,
        }

    def paper_resources(self) -> dict[str, Any]:
        n, m = self.n, self.m
        last = self.config.options.include_last_backup
        return {
            "source": (
                "the technical paper, §Backup variant, Depth reduction and Resource scalings"
            ),
            "walkers_max": 2 * (n + m) - (0 if last else 1),
            "walkers_formula": "2(n + m)" + ("" if last else " − 1 (no D̃_m, arXiv count)"),
            "gates": 3 * ((1 << n) - 1),
            "gates_formula": "3(2^n − 1)",
            "n_sites_per_level": [EDGE_SITES] * n,
            "n_sites_formula": "n_sites^d = 4",
            "sites_path": 4 * n,
            "sites_path_formula": "4n",
            "routing_time": 6 * n + 2 * m,
            "routing_time_formula": "T_parallel = 6n + 2m",
            "depth": f"10n + 4m + t_Q = {10 * n + 4 * m} + t_Q",
            "depth_formula": "T_backup = 10n + 4m + t_Q (pass-through memory cell)",
            "engine_depth_formula": "2(4n + K) + T_q (memory lane hosting the train)",
        }
