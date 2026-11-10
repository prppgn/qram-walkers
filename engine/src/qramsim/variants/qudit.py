"""Qudit variants (technical paper, §Qudit variant; PROTOCOL.md §3.9, §5.3).

Every walker is a four-level qudit, always present: logical bit (``○ = 0``, ``● = 1``) ×
routing colour. Slots front→tail as in the basic variant: ``A_1 … A_n, D_0, D_1 … D_m``
(+ ``D_{m+1}`` with ``cell_switch``). Encoding ``a_i = 0 → ○R``, ``a_i = 1 → ●R``; data and
flags ``●R``; the memory stores ``○R`` (0) or ``●R`` (1) and the copy applies the logical
NOT X̂ᴸ where it reads ``○R``.

* ``qudit_long``: long-range Û⁽ᵈ⁾ = Û_○ ⊕ Û_● on edges of ``K − d + 1`` sites and the
  subspace-dependent Ŝ, oriented as the dual-rail one (DECISION D32);
* ``qudit_short``: Û_in(A_{d+1}|A_d) (control: logical value) and a chain of
  Û_B(W_{i+1}|W_i) (control: blue colour) on 2-site edges, and the colour-only Ŝ_sr.
  No backups are needed: the walkers are always present, so the chain never meets a gap.
"""

from __future__ import annotations

from typing import Any, ClassVar

from ..alphabet import Family, Qudit
from ..gates import GateKind
from ..geometry import PORT_LEVEL
from ..rules import QuditRules, Rules
from ..schedule import GateInstance, Phase
from ..state import Branch
from ..train import SlotRole
from .backup import level_tag
from .base import Readout
from .basic import BasicVariant

Q = Qudit  # short name for the gate tables

SHORT_EDGE_SITES = 2  # technical paper, §Short-range routing operations


class QuditLongVariant(BasicVariant):
    name: ClassVar[str] = "qudit_long"
    family: ClassVar[Family] = Family.QUDIT

    def make_rules(self) -> Rules:
        return QuditRules(long=self.long_range)

    def encode(self, address: str) -> tuple[int, ...]:
        return tuple(
            (Q.fR if address[s.bit - 1] == "1" else Q.oR) if s.role is SlotRole.ADDRESS else Q.fR
            for s in self.slots
        )

    def output_states(self, address: str, data: tuple[int, ...]) -> tuple[int, ...]:
        states = []
        for s in self.slots:
            if s.role is SlotRole.ADDRESS:
                states.append(Q.fR if address[s.bit - 1] == "1" else Q.oR)
            elif s.role is SlotRole.DATA:
                states.append(Q.fR if data[s.bit - 1] else Q.oR)
            else:
                states.append(Q.fR)
        return tuple(states)

    def readout(self, branch: Branch) -> Readout:
        address = []
        data = [0] * self.m
        erased = []
        ok = not branch.cells_on and not branch.strays and not branch.collided
        for slot, w, p in zip(self.slots, branch.slots, branch.present, strict=True):
            if not p:
                ok = False
                erased.append(slot.label)
                if slot.role is SlotRole.ADDRESS:
                    address.append("0")
                continue
            exited = w.level == PORT_LEVEL and w.site == -slot.index and w.dir == -1
            ok = ok and exited and w.s in (Q.oR, Q.fR)
            bit = 1 if w.s in (Q.fR, Q.fB) else 0
            if slot.role is SlotRole.ADDRESS:
                address.append(str(bit))
            elif slot.role is SlotRole.DATA:
                data[slot.bit - 1] = bit
            else:  # flags must come back as ●R
                ok = ok and w.s == Q.fR
        return Readout("".join(address), tuple(data), ok, tuple(erased))

    def always_present(self) -> tuple[int, ...]:
        return tuple(range(self.K))

    def paper_resources(self) -> dict[str, Any]:
        n, m = self.n, self.m
        flags = 2 if self.cell_switch else 1
        return {
            "source": "the technical paper, §Qudit variant, Resource scalings",
            "walkers_max": n + m + flags,
            "walkers_formula": "n + m (+ flag D_0"
            + (", delimiter D_{m+1})" if flags == 2 else ")"),
            "gates": 2 * ((1 << n) - 1),
            "gates_formula": "2(2^n − 1)",
            "n_sites_per_level": [n + m - d for d in range(1, n + 1)],
            "n_sites_formula": "n_sites^d = n + m − d",
            "sites_path": n * (n + m) - n * (n + 1) // 2,
            "sites_path_formula": "n(n + m) − n(n + 1)/2",
            "depth": "O(n(n + m)); comparison table: n²/2 + nm + O(n + m)",
        }


class QuditShortVariant(QuditLongVariant):
    name: ClassVar[str] = "qudit_short"
    long_range: ClassVar[bool] = False

    def default_sites(self, d: int) -> int:
        return SHORT_EDGE_SITES

    def forward_gates(self) -> list[GateInstance]:
        geo = self.geometry
        gates: list[GateInstance] = []
        for d in range(1, self.n + 1):
            if geo.sites(d) < SHORT_EDGE_SITES:
                raise ValueError(f"Û_in/Û_B need edges of at least {SHORT_EDGE_SITES} sites")
            k_ctrl = d - 1  # slot of A_d
            tick0 = geo.X(d, 2) + k_ctrl
            gates.append(
                GateInstance(
                    id=f"Uin{d}",
                    kind=GateKind.U_IN,
                    level=d,
                    control_site=2,
                    target_sites=(1,),
                    tick=tick0,
                    phase=Phase.ROUTING,
                    label=f"Û_in{level_tag(d)}",
                    control_slot=k_ctrl,
                    target_slots=(k_ctrl + 1,),
                )
            )
            # Û_B(W_{k+1} | W_k) for every control from A_{d+1} to the slot before the tail
            for k in range(d, self.K - 1):
                gates.append(
                    GateInstance(
                        id=f"UB{d}:{self.slots[k].name}",
                        kind=GateKind.U_B,
                        level=d,
                        control_site=2,
                        target_sites=(1,),
                        tick=geo.X(d, 2) + k,
                        phase=Phase.ROUTING,
                        label=f"Û_B{level_tag(d)} [{self.slots[k].label}]",
                        control_slot=k,
                        target_slots=(k + 1,),
                    )
                )
        return gates

    def gate_locations(self) -> dict[str, Any]:
        loc = super().gate_locations()
        nodes = (1 << self.n) - 1
        loc.pop("U")
        return {"U_in": nodes, "U_B": nodes, **loc}

    def paper_resources(self) -> dict[str, Any]:
        n, m = self.n, self.m
        res = super().paper_resources()
        res.update(
            {
                "gates": 3 * ((1 << n) - 1),
                "gates_formula": "3(2^n − 1)",
                "n_sites_per_level": [SHORT_EDGE_SITES] * n,
                "n_sites_formula": "n_sites^d = 2",
                "sites_path": 2 * n,
                "sites_path_formula": "2n",
                "depth": f"5n + 2m = {5 * n + 2 * m}",
                "depth_formula": "T_parallel = 5n + 2m (pass-through memory cell)",
                "engine_depth_formula": "2(2n + K) + T_q (memory lane hosting the train)",
            }
        )
        return res
