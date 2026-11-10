from __future__ import annotations

import cmath
import math

import numpy as np

from qramsim import InputTerm, Options, RecordOptions, RunConfig
from qramsim.config import fill_memory

NO_FRAMES = RecordOptions(frames=False, ghosts=True)


def random_superposition(n: int, rng: np.random.Generator) -> tuple[InputTerm, ...]:
    """Random support size and random complex amplitudes."""
    size = int(rng.integers(1, (1 << n) + 1))
    chosen = rng.choice(1 << n, size=size, replace=False)
    return tuple(
        InputTerm(
            format(int(a), f"0{n}b"),
            cmath.rect(float(rng.uniform(0.05, 1.0)), float(rng.uniform(0, 2 * math.pi))),
        )
        for a in chosen
    )


def config(
    n: int,
    m: int,
    terms: tuple[InputTerm, ...],
    *,
    copy_mode: str = "global",
    memory_seed: int = 0,
    strict: bool = True,
    query: bool = True,
    stagger: bool = True,
    frames: bool = False,
) -> RunConfig:
    return RunConfig(
        n=n,
        m=m,
        copy_mode=copy_mode,
        terms=terms,
        memory=fill_memory(n, m, "random", memory_seed),
        options=Options(strict=strict, query=query, query_stagger=stagger),
        record=RecordOptions(frames=frames),
    )
