"""Dual-rail variants (technical paper, §Dual-rail implementations; PROTOCOL.md §3.10,
§5.4).

Two trees: ``↑`` (logical 0) and ``↓`` (logical 1). A walker's local state ``(r, c)``
carries its rail, i.e. the tree it moves on, so every walker is always present on
exactly one tree. Gates sit on both trees and act on the walkers of the tree of their
control; Ŝ⁽↓⁾ = Ŝ and Ŝ⁽↑⁾ = Ŝ X̂, so the two trees run "photographic negatives" of the
bosonic protocols. Data arrive on ``↓``; the copy flips the colour of ``D_j`` where the
stored bit is 0 and the output circuit of the cell (Ŝ_M, Ŝ_M†, X̂_c) moves those walkers
to ``↑`` (DECISION D33). The variants start with the walkers already on their rails
(D33); the paper's preparation time ``T_prep`` is reported, not simulated.

* ``dualrail_basic``: slots and long-range Û⁽ᵈ⁾ of the basic variant (flag ``D_0`` on
  ``↓``; copy ``global`` or ``cell_switch``);
* ``dualrail_backup``: every carrier ``W`` followed by two backups ``W̃^↑``, ``W̃^↓`` that
  share one path coordinate on the two trees (no flag); each tree then runs the
  single-tree backup variant: Û_in, Û_B on 4-site edges, backup copy controlled by
  ``D̃_{j−1}^↓`` (``Ã_n^↓`` for ``D_1``).
"""

from __future__ import annotations

from typing import Any, ClassVar

from ..alphabet import DualRail, Family
from ..gates import GateKind
from ..geometry import PORT_LEVEL
from ..rules import DualRailRules, Rules
from ..schedule import GateInstance, Phase
from ..state import Branch
from ..train import Slot, SlotRole, dualrail_backup_train
from .backup import EDGE_SITES, BackupVariant, level_tag
from .base import Readout, Variant
from .basic import BasicVariant

DR = DualRail  # short name for the gate tables


def _rail_state(bit: int | str) -> int:
    return DR.dR if str(bit) == "1" else DR.uR


def output_circuit(variant: Variant, T: int) -> list[GateInstance]:
    """Ŝ_M, Ŝ_M† on every resting site of the lane, then X̂_c on the data sites, at ticks
    ``T``, ``T + 1``, ``T + 2`` of the query (DECISION D33)."""
    lane = variant.geometry.lane_level
    every = sorted(range(variant.K), key=variant.rest_site, reverse=True)
    sites = tuple(dict.fromkeys(variant.rest_site(k) for k in every))
    data = [s.index for s in variant.slots if s.role is SlotRole.DATA]
    specs = [
        (GateKind.OUT_S, "Ŝ_M", sites, tuple(every)),
        (GateKind.OUT_SDAG, "Ŝ_M†", sites, tuple(every)),
        (GateKind.X_C, "X̂_c", tuple(variant.rest_site(k) for k in data), tuple(data)),
    ]
    return [
        GateInstance(
            id=f"out_{kind}",
            kind=kind,
            level=lane,
            control_site=None,
            target_sites=window,
            tick=T + i,
            phase=Phase.QUERY,
            label=label,
            target_slots=slots,
        )
        for i, (kind, label, window, slots) in enumerate(specs)
    ]


def _readout(variant: Variant, branch: Branch) -> Readout:
    address = []
    data = [0] * variant.m
    erased = []
    ok = not branch.cells_on and not branch.strays and not branch.collided
    for slot, w, p in zip(variant.slots, branch.slots, branch.present, strict=True):
        if not p:
            ok = False
            erased.append(slot.label)
            if slot.role is SlotRole.ADDRESS:
                address.append("0")
            continue
        exited = w.level == PORT_LEVEL and w.site == -variant.offset(slot.index) and w.dir == -1
        ok = ok and exited and w.s in (DR.uR, DR.dR)
        bit = 1 if w.s in (DR.dR, DR.dB) else 0
        if slot.role is SlotRole.ADDRESS:
            address.append(str(bit))
        elif slot.role is SlotRole.DATA:
            data[slot.bit - 1] = bit
        elif slot.rail:  # a backup must come back on its own rail
            ok = ok and w.s == (DR.uR if slot.rail == "u" else DR.dR)
        else:  # flag / delimiter on ↓
            ok = ok and w.s == DR.dR
    return Readout("".join(address), tuple(data), ok, tuple(erased))


class DualRailBasicVariant(BasicVariant):
    name: ClassVar[str] = "dualrail_basic"
    family: ClassVar[Family] = Family.DUALRAIL

    def make_rules(self) -> Rules:
        return DualRailRules()

    def encode(self, address: str) -> tuple[int, ...]:
        return tuple(
            _rail_state(address[s.bit - 1]) if s.role is SlotRole.ADDRESS else DR.dR
            for s in self.slots
        )

    def output_states(self, address: str, data: tuple[int, ...]) -> tuple[int, ...]:
        states = []
        for s in self.slots:
            if s.role is SlotRole.ADDRESS:
                states.append(_rail_state(address[s.bit - 1]))
            elif s.role is SlotRole.DATA:
                states.append(_rail_state(data[s.bit - 1]))
            else:
                states.append(DR.dR)
        return tuple(states)

    def query_gates(self, T_fwd: int) -> tuple[list[GateInstance], int]:
        gates, T_q = super().query_gates(T_fwd)
        return gates + output_circuit(self, T_fwd + T_q), T_q + 3

    def readout(self, branch: Branch) -> Readout:
        return _readout(self, branch)

    def always_present(self) -> tuple[int, ...]:
        return tuple(range(self.K))

    def gate_locations(self) -> dict[str, Any]:
        loc = super().gate_locations()
        loc["U"] *= 2
        loc["S"] *= 2
        loc["trees"] = 2
        loc["output_circuit_per_cell"] = {"S_M": 1, "S_M_dag": 1, "X_c": 1}
        return loc

    def paper_resources(self) -> dict[str, Any]:
        n, m = self.n, self.m
        walkers = n + m + 1 + (1 if self.cell_switch else 0)
        return {
            "source": "the technical paper, §Dual-rail implementations, Resource scaling",
            "walkers_max": walkers,
            "walkers_formula": "n + m + 1"
            + (" (+1 delimiter D_{m+1})" if self.cell_switch else ""),
            "trees": 2,
            "gates": 4 * ((1 << n) - 1),
            "gates_formula": "4(2^n − 1)",
            "n_sites_per_level": [n + m - d for d in range(1, n + 1)],
            "n_sites_formula": "n_sites^d = n + m − d (per tree)",
            "sites_path": (n * n + 2 * n * m - n) // 2,
            "sites_path_formula": "(n² + 2nm − n)/2 (per tree)",
            "T_prep": n + m,
            "depth": f"(n² + 2nm + n + 2m)/2 = {(n * n + 2 * n * m + n + 2 * m) // 2}",
            "depth_formula": "T_serial = T_prep + T_rout = (n² + 2nm + n + 2m)/2",
        }


class DualRailBackupVariant(BackupVariant):
    name: ClassVar[str] = "dualrail_backup"
    family: ClassVar[Family] = Family.DUALRAIL

    def make_rules(self) -> Rules:
        return DualRailRules()

    def build_slots(self) -> tuple[Slot, ...]:
        return dualrail_backup_train(self.n, self.m, self.config.options.include_last_backup)

    def offset(self, k: int) -> int:
        slot = self.slots[k]
        carrier = slot.bit - 1 if slot.register == "A" else self.n + slot.bit - 1
        return 2 * carrier + (1 if slot.backup else 0)

    def encode(self, address: str) -> tuple[int, ...]:
        states = []
        for s in self.slots:
            if s.role is SlotRole.ADDRESS:
                states.append(_rail_state(address[s.bit - 1]))
            elif s.backup:
                states.append(DR.uR if s.rail == "u" else DR.dR)
            else:
                states.append(DR.dR)
        return tuple(states)

    def output_states(self, address: str, data: tuple[int, ...]) -> tuple[int, ...]:
        states = list(self.encode(address))
        for s in self.slots:
            if s.role is SlotRole.DATA:
                states[s.index] = _rail_state(data[s.bit - 1])
        return tuple(states)

    def always_present(self) -> tuple[int, ...]:
        return tuple(range(self.K))

    def backup_pair(self, stem: str, bit: int) -> tuple[Slot, Slot]:
        return self.slots[self.k_of(f"{stem}_{bit}u")], self.slots[self.k_of(f"{stem}_{bit}d")]

    def forward_gates(self) -> list[GateInstance]:
        geo = self.geometry
        gates: list[GateInstance] = []
        controls = [("At", i) for i in range(1, self.n + 1)] + [("Dt", j) for j in range(1, self.m)]
        for d in range(1, self.n + 1):
            if geo.sites(d) < EDGE_SITES:
                raise ValueError(f"the backup gates need edges of at least {EDGE_SITES} sites")
            a = self.k_of(f"A_{d}")
            up, down = self.backup_pair("At", d)
            gates.append(
                GateInstance(
                    id=f"Uin{d}",
                    kind=GateKind.U_IN,
                    level=d,
                    control_site=3,
                    target_sites=(2,),
                    tick=geo.X(d, 3) + self.offset(a),
                    phase=Phase.ROUTING,
                    label=f"Û_in{level_tag(d)}",
                    control_slot=a,
                    target_slots=(up.index, down.index),
                )
            )
            for stem, bit in controls[d - 1 :]:
                up, down = self.backup_pair(stem, bit)
                after = (self.offset(down.index) + 1, self.offset(down.index) + 2)
                nxt = [s for s in self.slots if self.offset(s.index) in after]
                gates.append(
                    GateInstance(
                        id=f"UB{d}:{stem}_{bit}",
                        kind=GateKind.U_B,
                        level=d,
                        control_site=4,
                        target_sites=(3, 2),
                        tick=geo.X(d, 4) + self.offset(down.index),
                        phase=Phase.ROUTING,
                        label=f"Û_B{level_tag(d)} [{up.label}, {down.label}]",
                        control_slot=down.index,
                        target_slots=tuple(s.index for s in nxt),
                    )
                )
        return gates

    def query_gates(self, T_fwd: int) -> tuple[list[GateInstance], int]:
        lane = self.geometry.lane_level
        stagger = self.config.options.query_stagger
        gates = []
        for j in range(1, self.m + 1):
            ctrl = self.k_of(f"At_{self.n}d" if j == 1 else f"Dt_{j - 1}d")
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
        T_q = self.m if stagger else 1
        return gates + output_circuit(self, T_fwd + T_q), T_q + 3

    def readout(self, branch: Branch) -> Readout:
        return _readout(self, branch)

    def gate_locations(self) -> dict[str, Any]:
        loc = super().gate_locations()
        for key in ("U_in", "U_B", "S"):
            loc[key] *= 2
        loc["trees"] = 2
        loc["output_circuit_per_cell"] = {"S_M": 1, "S_M_dag": 1, "X_c": 1}
        return loc

    def paper_resources(self) -> dict[str, Any]:
        n, m = self.n, self.m
        last = self.config.options.include_last_backup
        return {
            "source": (
                "the technical paper, §Backup variant for dual-rail implementation, "
                "Resource scalings"
            ),
            "walkers_max": 3 * (n + m) - (0 if last else 2),
            "walkers_formula": "3(n + m)" + ("" if last else " − 2 (no backups of D_m)"),
            "trees": 2,
            "gates": 6 * ((1 << n) - 1),
            "gates_formula": "6(2^n − 1)",
            "n_sites_per_level": [EDGE_SITES] * n,
            "n_sites_formula": "n_sites^d = 4 (per tree)",
            "sites_path": 4 * n,
            "sites_path_formula": "4n (per tree)",
            "T_prep": 3 * (n + m),
            "routing_time": 10 * n + 4 * m,
            "routing_time_formula": "T_rout = 10n + 4m",
            "depth": f"13n + 7m = {13 * n + 7 * m}",
            "depth_formula": "T_parallel = T_prep + T_rout = 3(n + m) + 10n + 4m",
            "engine_depth_formula": "2(4n + 2(n + m)) + T_q (memory lane hosting the train)",
        }
