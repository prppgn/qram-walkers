"""Basic variant (technical paper, §Basic variant; arXiv main text and appendix A–B;
PROTOCOL.md §5.1).

Slots front→tail: ``A_1 … A_n, D_0, D_1 … D_m`` (+ ``D_{m+1}`` in ``cell_switch`` mode).
Encoding ``a_i = 1 → R``, ``a_i = 0 → ∅``; data, flag and delimiter walkers red.
Routing: long-range address transmission Û⁽ᵈ⁾ on the edges of level ``d`` followed by the
passive scattering Ŝ. Query: global copy controlled by ``D_0`` or cell switch
(``D_0`` switches the cell on, ``D_{m+1}`` switches it off).
"""

from __future__ import annotations

from typing import Any, ClassVar

from ..alphabet import EMPTY, RED, Family
from ..config import RunConfig
from ..gates import GateKind
from ..geometry import PORT_LEVEL
from ..schedule import GateInstance, Phase
from ..state import Branch
from ..train import Slot, SlotRole, basic_train
from .base import Readout, Variant

_SUPERSCRIPT = str.maketrans("0123456789", "⁰¹²³⁴⁵⁶⁷⁸⁹")


def u_label(d: int) -> str:
    return f"Û⁽{str(d).translate(_SUPERSCRIPT)}⁾"


class BasicVariant(Variant):
    name: ClassVar[str] = "basic"
    family: ClassVar[Family] = Family.BOSONIC
    long_range: ClassVar[bool] = True  # Û⁽ᵈ⁾ needs the whole train behind A_d on the edge

    def __init__(self, config: RunConfig) -> None:
        super().__init__(config)
        for d in range(1, self.n + 1 if self.long_range else 1):
            needed = self.K - d + 1
            have = self.geometry.sites(d)
            if have < needed:
                missed = needed - have
                self.warnings.append(
                    f"n_sites({d}) = {have} is shorter than the train behind A_{d} "
                    f"({needed} sites needed): {u_label(d)} misses the last {missed} slot(s), "
                    "so Eq. (1) is not expected to hold"
                )

    @property
    def cell_switch(self) -> bool:
        return self.copy_mode == "cell_switch"

    def build_slots(self) -> tuple[Slot, ...]:
        return basic_train(self.n, self.m, delimiter=self.copy_mode == "cell_switch")

    def default_sites(self, d: int) -> int:
        # The control A_d plus every slot behind it fit on the edge (PROTOCOL.md §4.1).
        return self.K - d + 1

    def k_of(self, role: SlotRole, bit: int) -> int:
        for s in self.slots:
            if s.role is role and s.bit == bit:
                return s.index
        raise KeyError((role, bit))

    def encode(self, address: str) -> tuple[int, ...]:
        states = []
        for s in self.slots:
            if s.role is SlotRole.ADDRESS:
                states.append(RED if address[s.bit - 1] == "1" else EMPTY)
            else:
                states.append(RED)
        return tuple(states)

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

    # -- schedule ----------------------------------------------------------------------

    def forward_gates(self) -> list[GateInstance]:
        geo = self.geometry
        gates = []
        for d in range(1, self.n + 1):
            last = geo.sites(d)
            k_ctrl = d - 1  # slot of A_d
            target_sites = tuple(range(last - 1, 0, -1))
            target_slots = tuple(
                k_ctrl + (last - s) for s in target_sites if k_ctrl + (last - s) < self.K
            )
            gates.append(
                GateInstance(
                    id=f"U{d}",
                    kind=GateKind.U,
                    level=d,
                    control_site=last,
                    target_sites=target_sites,
                    tick=geo.X(d, last) + k_ctrl,
                    phase=Phase.ROUTING,
                    label=u_label(d),
                    control_slot=k_ctrl,
                    target_slots=target_slots,
                )
            )
        return gates

    def query_gates(self, T_fwd: int) -> tuple[list[GateInstance], int]:
        lane = self.geometry.lane_level
        k0 = self.k_of(SlotRole.FLAG, 0)
        data = [self.k_of(SlotRole.DATA, j) for j in range(1, self.m + 1)]
        stagger = self.config.options.query_stagger
        groups = [[j] for j in range(1, self.m + 1)] if stagger else [list(range(1, self.m + 1))]
        gates: list[GateInstance] = []

        def copy_gate(kind: GateKind, js: list[int], tick: int, ctrl: int | None) -> GateInstance:
            names = ", ".join(self.slots[data[j - 1]].label for j in js)
            base = "Û_copy⁽ᵃ⁾" if kind is GateKind.COPY_GLOBAL else "Û_copy(F)"
            return GateInstance(
                id="copy_" + "_".join(f"D{j}" for j in js),
                kind=kind,
                level=lane,
                control_site=None if ctrl is None else self.rest_site(ctrl),
                target_sites=tuple(self.rest_site(data[j - 1]) for j in js),
                tick=tick,
                phase=Phase.QUERY,
                label=f"{base} [{names}]",
                target_bits=tuple(js),
                control_slot=ctrl,
                target_slots=tuple(data[j - 1] for j in js),
            )

        if not self.cell_switch:
            for i, js in enumerate(groups):
                gates.append(copy_gate(GateKind.COPY_GLOBAL, js, T_fwd + i, k0))
            return gates, len(groups)

        k_off = self.k_of(SlotRole.DELIMITER, self.m + 1)
        gates.append(
            GateInstance(
                id="cell_on",
                kind=GateKind.CELL_ON,
                level=lane,
                control_site=self.rest_site(k0),
                target_sites=(),
                tick=T_fwd,
                phase=Phase.QUERY,
                label="Û_on(F|D₀)",
                control_slot=k0,
            )
        )
        for i, js in enumerate(groups):
            gates.append(copy_gate(GateKind.COPY_CELL, js, T_fwd + 1 + i, None))
        off_tick = T_fwd + 1 + len(groups)
        gates.append(
            GateInstance(
                id="cell_off",
                kind=GateKind.CELL_OFF,
                level=lane,
                control_site=self.rest_site(k_off),
                target_sites=(),
                tick=off_tick,
                phase=Phase.QUERY,
                label=f"Û_off(F|{self.slots[k_off].label})",
                control_slot=k_off,
            )
        )
        return gates, len(groups) + 2

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
            elif not p:  # flag or delimiter lost
                ok = False
        return Readout("".join(address), tuple(data), ok)

    def always_present(self) -> tuple[int, ...]:
        return tuple(s.index for s in self.slots if s.role in (SlotRole.FLAG, SlotRole.DELIMITER))

    def gate_locations(self) -> dict[str, Any]:
        nodes = (1 << self.n) - 1
        if self.cell_switch:
            per_cell = {"cell_on": 1, "copy_cell": 1, "cell_off": 1}
        else:
            per_cell = {str(GateKind.COPY_GLOBAL): 1}
        return {"U": nodes, "S": nodes, "copy_per_cell": per_cell, "cells": 1 << self.n}

    def paper_resources(self) -> dict[str, Any]:
        n, m = self.n, self.m
        walkers = n + m + 1 + (1 if self.cell_switch else 0)
        return {
            "source": "the technical paper, §Basic variant, Resource scaling",
            "walkers_max": walkers,
            "walkers_formula": "n + m + 1"
            + (" (+1 delimiter D_{m+1})" if self.cell_switch else ""),
            "gates": 2 * ((1 << n) - 1),
            "gates_formula": "2(2^n − 1)",
            "n_sites_per_level": [n + m - d for d in range(1, n + 1)],
            "n_sites_formula": "n_sites^d = n + m − d",
            "sites_path": (n * n + n * (2 * m - 1)) // 2,
            "sites_path_formula": "Σ_d (n + m − d) = (n² + n(2m − 1))/2",
            "depth": "O(n(n + m))",
        }
