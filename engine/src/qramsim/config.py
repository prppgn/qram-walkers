"""Run configuration (``qramsim.run/1``, DESIGN.md §5).

A run is a pure function of its configuration. :class:`RunConfig` mirrors the JSON
format; :meth:`RunConfig.resolve` turns fill specifications (random memory, input
presets) into explicit data and normalises the input superposition.
"""

from __future__ import annotations

import cmath
import math
from dataclasses import dataclass, field, replace
from typing import Any

import numpy as np

from .geometry import all_addresses, check_address

RUN_SCHEMA = "qramsim.run/1"
VARIANTS = ("basic", "backup", "qudit_short", "qudit_long", "dualrail_basic", "dualrail_backup")
COPY_MODES = {
    "basic": ("global", "cell_switch"),
    "backup": ("backup",),
    "qudit_short": ("global", "cell_switch"),
    "qudit_long": ("global", "cell_switch"),
    "dualrail_basic": ("global", "cell_switch"),
    "dualrail_backup": ("backup",),
}
MEMORY_FILLS = ("zeros", "ones", "random", "identity")


class ConfigError(ValueError):
    """Invalid run configuration."""


@dataclass(frozen=True)
class InputTerm:
    address: str
    amp: complex


@dataclass(frozen=True)
class Options:
    include_last_backup: bool = True  # backup variants (Phase 2)
    query_stagger: bool = True  # copies one per tick (False: all in one tick)
    query: bool = True  # False skips the query phase (time-reversal checks, E5)
    inverse_mode: str = "time_reversal"
    n_sites: dict[str, int] = field(default_factory=dict)  # {"1": 6, ..., "memory": 7}
    strict: bool = False  # assert the runtime invariants of PROTOCOL.md §8.2
    prune_eps: float = 1e-10  # coherent errors: drop branches with |α|² below this
    max_branches: int = 2048  # coherent errors: keep at most this many branches


@dataclass(frozen=True)
class RecordOptions:
    frames: bool = True
    ghosts: bool = True
    frame_metrics: bool = False
    max_frame_branches: int = 64  # largest-weight branches stored per frame


@dataclass(frozen=True)
class RunConfig:
    variant: str = "basic"
    n: int = 2
    m: int = 1
    copy_mode: str = "global"
    options: Options = field(default_factory=Options)
    terms: tuple[InputTerm, ...] = ()
    memory: tuple[tuple[int, ...], ...] | None = None  # explicit bits, cell order
    memory_fill: str = "zeros"
    memory_seed: int | None = None
    noise: tuple[dict[str, Any], ...] = ()
    seed: int = 0
    record: RecordOptions = field(default_factory=RecordOptions)

    # -- validation and resolution -------------------------------------------------

    def validate(self) -> None:
        if self.variant not in VARIANTS:
            raise ConfigError(f"variant {self.variant!r} not implemented (available: {VARIANTS})")
        if self.copy_mode not in COPY_MODES[self.variant]:
            raise ConfigError(
                f"copy mode {self.copy_mode!r} not valid for {self.variant} "
                f"(choose from {COPY_MODES[self.variant]})"
            )
        if self.n < 1 or self.m < 1:
            raise ConfigError("n and m must be at least 1")
        if self.options.inverse_mode != "time_reversal":
            raise ConfigError("only inverse_mode='time_reversal' is implemented")
        if not self.terms:
            raise ConfigError("the input superposition has no terms")
        for term in self.terms:
            try:
                check_address(term.address, self.n)
            except ValueError as exc:
                raise ConfigError(str(exc)) from exc
        if self.memory is not None:
            if len(self.memory) != 1 << self.n:
                raise ConfigError(f"memory must list 2^n = {1 << self.n} cells")
            for row in self.memory:
                if len(row) != self.m or any(b not in (0, 1) for b in row):
                    raise ConfigError(f"each memory cell must hold {self.m} bits (0/1)")
        elif self.memory_fill not in MEMORY_FILLS:
            raise ConfigError(f"memory fill must be one of {MEMORY_FILLS}")

    def resolved_memory(self) -> tuple[tuple[int, ...], ...]:
        if self.memory is not None:
            return self.memory
        return fill_memory(self.n, self.m, self.memory_fill, self.memory_seed)

    def normalised_terms(self) -> tuple[InputTerm, ...]:
        """Merge duplicate addresses and normalise the amplitudes."""
        merged: dict[str, complex] = {}
        for term in self.terms:
            merged[term.address] = merged.get(term.address, 0j) + term.amp
        norm = math.sqrt(sum(abs(a) ** 2 for a in merged.values()))
        if norm == 0:
            raise ConfigError("the input superposition has zero norm")
        return tuple(InputTerm(a, amp / norm) for a, amp in merged.items() if amp != 0)

    def resolve(self) -> RunConfig:
        """Validated copy with explicit memory and normalised input."""
        self.validate()
        return replace(self, terms=self.normalised_terms(), memory=self.resolved_memory())

    # -- JSON ----------------------------------------------------------------------

    def to_dict(self) -> dict[str, Any]:
        memory: dict[str, Any]
        if self.memory is not None:
            memory = {"bits": [list(row) for row in self.memory]}
        else:
            memory = {"fill": self.memory_fill, "seed": self.memory_seed}
        opts = self.options
        return {
            "schema": RUN_SCHEMA,
            "variant": self.variant,
            "n": self.n,
            "m": self.m,
            "copy_mode": self.copy_mode,
            "options": {
                "include_last_backup": opts.include_last_backup,
                "query_stagger": opts.query_stagger,
                "query": opts.query,
                "inverse_mode": opts.inverse_mode,
                "n_sites": dict(opts.n_sites),
                "strict": opts.strict,
                "prune_eps": opts.prune_eps,
                "max_branches": opts.max_branches,
            },
            "input": {
                "terms": [
                    {"address": t.address, "amp": [t.amp.real, t.amp.imag]} for t in self.terms
                ]
            },
            "memory": memory,
            "noise": [dict(x) for x in self.noise],
            "seed": self.seed,
            "record": {
                "frames": self.record.frames,
                "ghosts": self.record.ghosts,
                "frame_metrics": self.record.frame_metrics,
                "max_frame_branches": self.record.max_frame_branches,
            },
        }

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> RunConfig:
        schema = data.get("schema", RUN_SCHEMA)
        if not str(schema).startswith("qramsim.run/1"):
            raise ConfigError(f"unsupported run schema {schema!r}")
        opts = data.get("options", {})
        rec = data.get("record", {})
        mem = data.get("memory", {"fill": "zeros"})
        terms = tuple(
            InputTerm(str(t["address"]), _parse_amp(t.get("amp", 1.0)))
            for t in data.get("input", {}).get("terms", [])
        )
        memory = None
        if "bits" in mem:
            memory = tuple(tuple(int(b) for b in row) for row in mem["bits"])
        return cls(
            variant=str(data.get("variant", "basic")),
            n=int(data.get("n", 2)),
            m=int(data.get("m", 1)),
            copy_mode=str(
                data.get("copy_mode", default_copy_mode(str(data.get("variant", "basic"))))
            ),
            options=Options(
                include_last_backup=bool(opts.get("include_last_backup", True)),
                query_stagger=bool(opts.get("query_stagger", True)),
                query=bool(opts.get("query", True)),
                inverse_mode=str(opts.get("inverse_mode", "time_reversal")),
                n_sites={str(k): int(v) for k, v in opts.get("n_sites", {}).items()},
                strict=bool(opts.get("strict", False)),
                prune_eps=float(opts.get("prune_eps", 1e-10)),
                max_branches=int(opts.get("max_branches", 2048)),
            ),
            terms=terms,
            memory=memory,
            memory_fill=str(mem.get("fill", "zeros")),
            memory_seed=mem.get("seed"),
            noise=tuple(dict(x) for x in data.get("noise", [])),
            seed=int(data.get("seed", 0)),
            record=RecordOptions(
                frames=bool(rec.get("frames", True)),
                ghosts=bool(rec.get("ghosts", True)),
                frame_metrics=bool(rec.get("frame_metrics", False)),
                max_frame_branches=int(rec.get("max_frame_branches", 64)),
            ),
        )


def default_copy_mode(variant: str) -> str:
    modes = COPY_MODES.get(variant)
    return modes[0] if modes else "global"


def _parse_amp(value: Any) -> complex:
    if isinstance(value, (list, tuple)):
        re, im = (float(value[0]), float(value[1]) if len(value) > 1 else 0.0)
        return complex(re, im)
    if isinstance(value, str):
        return complex(value.replace(" ", "").replace("i", "j"))
    return complex(value)


def fill_memory(n: int, m: int, fill: str, seed: int | None) -> tuple[tuple[int, ...], ...]:
    """Memory contents from a fill rule.

    ``identity`` stores in cell ``a`` the ``m`` least significant bits of ``a`` (padded
    with zeros on the left when ``m > n``).
    """
    cells = 1 << n
    if fill == "zeros":
        return tuple((0,) * m for _ in range(cells))
    if fill == "ones":
        return tuple((1,) * m for _ in range(cells))
    if fill == "identity":
        return tuple(tuple(int(c) for c in format(a % (1 << m), f"0{m}b")) for a in range(cells))
    if fill == "random":
        rng = np.random.default_rng(seed)
        bits = rng.integers(0, 2, size=(cells, m))
        return tuple(tuple(int(b) for b in row) for row in bits)
    raise ConfigError(f"unknown memory fill {fill!r}")


# ---------------------------------------------------------------------------
# Input presets (CLI ``--input``).


def input_terms(spec: str, n: int, seed: int = 0) -> tuple[InputTerm, ...]:
    """Input superposition from a preset name.

    ``uniform`` (all 2^n addresses, equal amplitudes), ``ghz`` (|0…0⟩ + |1…1⟩),
    ``random`` / ``random:k`` (k random addresses with random complex amplitudes),
    ``w`` (addresses of Hamming weight one), or a comma-separated list of addresses
    (equal superposition).
    """
    if spec == "uniform":
        return tuple(InputTerm(a, 1.0 + 0j) for a in all_addresses(n))
    if spec == "ghz":
        return (InputTerm("0" * n, 1.0 + 0j), InputTerm("1" * n, 1.0 + 0j))
    if spec == "w":
        return tuple(InputTerm(format(1 << i, f"0{n}b"), 1.0 + 0j) for i in range(n))
    if spec.startswith("random"):
        rng = np.random.default_rng(seed)
        k = int(spec.split(":", 1)[1]) if ":" in spec else int(rng.integers(1, (1 << n) + 1))
        k = max(1, min(k, 1 << n))
        chosen = rng.choice(1 << n, size=k, replace=False)
        return tuple(
            InputTerm(
                format(int(a), f"0{n}b"),
                cmath.rect(float(rng.uniform(0.2, 1.0)), float(rng.uniform(0, 2 * math.pi))),
            )
            for a in sorted(chosen)
        )
    addresses = [a.strip() for a in spec.split(",") if a.strip()]
    for a in addresses:
        try:
            check_address(a, n)
        except ValueError as exc:
            raise ConfigError(str(exc)) from exc
    return tuple(InputTerm(a, 1.0 + 0j) for a in addresses)
