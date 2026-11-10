"""Slots of the walker train (PROTOCOL.md §1.2).

The train is a fixed ordered sequence of slots ``k = 0..K-1``; slot 0 is the front
(first injected), slot ``K-1`` the tail. Code always stores slots front→tail; the
paper's tail→front order is used only for display.
"""

from __future__ import annotations

import unicodedata
from dataclasses import dataclass
from enum import StrEnum
from typing import Literal

_SUBSCRIPT = str.maketrans("0123456789+-", "₀₁₂₃₄₅₆₇₈₉₊₋")
_TILDE = "\N{COMBINING TILDE}"


class SlotRole(StrEnum):
    ADDRESS = "address"
    ADDRESS_BACKUP = "address_backup"
    FLAG = "flag"
    DATA = "data"
    DATA_BACKUP = "data_backup"
    DELIMITER = "delimiter"


@dataclass(frozen=True)
class Slot:
    """One slot of the train.

    ``bit`` is the address bit index ``i`` of ``A_i`` / ``Ã_i`` or the data index ``j`` of
    ``D_j`` / ``D̃_j`` (``0`` for the flag ``D_0``, ``m+1`` for the delimiter).
    """

    index: int
    name: str  # ASCII name used in code and JSON: "A_1", "D_0", "Dt_1" (= D̃_1)
    role: SlotRole
    register: Literal["A", "D"]
    backup: bool
    bit: int
    rail: str = ""  # dual-rail backups: "u" (W̃^↑) or "d" (W̃^↓)

    @property
    def _arrow(self) -> str:
        return {"u": "↑", "d": "↓"}.get(self.rail, "")

    @property
    def letter(self) -> str:
        """``A``, ``D``, ``Ã`` or ``D̃`` (NFC: ``Ã`` is precomposed, ``D̃`` is not)."""
        return unicodedata.normalize("NFC", self.register + (_TILDE if self.backup else ""))

    @property
    def label(self) -> str:
        """Unicode label in the paper's notation: ``A₁``, ``D₀``, ``Ã₂``."""
        return self.letter + str(self.bit).translate(_SUBSCRIPT) + self._arrow

    @property
    def ket_label(self) -> str:
        """Compact label used in printed kets: ``A1``, ``D0``, ``Ã2``."""
        return f"{self.letter}{self.bit}{self._arrow}"

    @property
    def latex(self) -> str:
        letter = rf"\tilde{{{self.register}}}" if self.backup else self.register
        arrow = {"u": r"^{\uparrow}", "d": r"^{\downarrow}"}.get(self.rail, "")
        return f"{letter}_{{{self.bit}}}{arrow}"


def basic_train(n: int, m: int, delimiter: bool) -> tuple[Slot, ...]:
    """Slots of the basic variant: ``A_1 … A_n, D_0, D_1 … D_m`` (+ ``D_{m+1}``)."""
    slots: list[Slot] = []
    for i in range(1, n + 1):
        slots.append(Slot(len(slots), f"A_{i}", SlotRole.ADDRESS, "A", False, i))
    slots.append(Slot(len(slots), "D_0", SlotRole.FLAG, "D", False, 0))
    for j in range(1, m + 1):
        slots.append(Slot(len(slots), f"D_{j}", SlotRole.DATA, "D", False, j))
    if delimiter:
        slots.append(Slot(len(slots), f"D_{m + 1}", SlotRole.DELIMITER, "D", False, m + 1))
    return tuple(slots)


def backup_train(n: int, m: int, last_backup: bool) -> tuple[Slot, ...]:
    """Slots of the backup variant: ``A_1, Ã_1, …, A_n, Ã_n, D_1, D̃_1, …, D_m (, D̃_m)``."""
    slots: list[Slot] = []
    for i in range(1, n + 1):
        slots.append(Slot(len(slots), f"A_{i}", SlotRole.ADDRESS, "A", False, i))
        slots.append(Slot(len(slots), f"At_{i}", SlotRole.ADDRESS_BACKUP, "A", True, i))
    for j in range(1, m + 1):
        slots.append(Slot(len(slots), f"D_{j}", SlotRole.DATA, "D", False, j))
        if j < m or last_backup:
            slots.append(Slot(len(slots), f"Dt_{j}", SlotRole.DATA_BACKUP, "D", True, j))
    return tuple(slots)


def dualrail_backup_train(n: int, m: int, last_backup: bool) -> tuple[Slot, ...]:
    """Slots of the dual-rail backup variant: every carrier followed by its two backups
    ``W̃^↑``, ``W̃^↓`` (technical paper, §Backup variant for dual-rail; no flag,
    DECISION D33).
    ``last_backup = False`` drops the two backups of ``D_m``."""
    slots: list[Slot] = []

    def carrier(name: str, role: SlotRole, register: Literal["A", "D"], bit: int) -> None:
        slots.append(Slot(len(slots), name, role, register, False, bit))

    def backups(stem: str, role: SlotRole, register: Literal["A", "D"], bit: int) -> None:
        for rail in ("u", "d"):
            slots.append(Slot(len(slots), f"{stem}_{bit}{rail}", role, register, True, bit, rail))

    for i in range(1, n + 1):
        carrier(f"A_{i}", SlotRole.ADDRESS, "A", i)
        backups("At", SlotRole.ADDRESS_BACKUP, "A", i)
    for j in range(1, m + 1):
        carrier(f"D_{j}", SlotRole.DATA, "D", j)
        if j < m or last_backup:
            backups("Dt", SlotRole.DATA_BACKUP, "D", j)
    return tuple(slots)


def slot_by_name(slots: tuple[Slot, ...], name: str) -> Slot:
    for slot in slots:
        if slot.name == name:
            return slot
    raise KeyError(name)
