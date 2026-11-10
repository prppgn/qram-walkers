"""Variant registry."""

from __future__ import annotations

from ..config import ConfigError, RunConfig
from .backup import BackupVariant
from .base import Readout, Variant
from .basic import BasicVariant
from .dualrail import DualRailBackupVariant, DualRailBasicVariant
from .qudit import QuditLongVariant, QuditShortVariant

REGISTRY: dict[str, type[Variant]] = {
    cls.name: cls
    for cls in (
        BasicVariant,
        BackupVariant,
        QuditShortVariant,
        QuditLongVariant,
        DualRailBasicVariant,
        DualRailBackupVariant,
    )
}


def make_variant(config: RunConfig) -> Variant:
    try:
        cls = REGISTRY[config.variant]
    except KeyError as exc:
        raise ConfigError(f"unknown variant {config.variant!r}") from exc
    return cls(config)


__all__ = [
    "REGISTRY",
    "BackupVariant",
    "BasicVariant",
    "DualRailBackupVariant",
    "DualRailBasicVariant",
    "QuditLongVariant",
    "QuditShortVariant",
    "Readout",
    "Variant",
    "make_variant",
]
