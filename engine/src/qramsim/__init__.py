"""qramsim — simulation engine of the quantum-walker quantum RAM.

De Riso, Catalano, Lloyd, Giovannetti, De Santis, *A resource-efficient quantum-walker
Quantum RAM*, arXiv:2508.02855. The engine is the single source of truth for the
physics; viewers render the trajectories it produces.
"""

from __future__ import annotations

from .api import SimulationResult, simulate
from .config import InputTerm, Options, RecordOptions, RunConfig
from .trajectory import Trajectory

__version__ = "0.1.0"

__all__ = [
    "InputTerm",
    "Options",
    "RecordOptions",
    "RunConfig",
    "SimulationResult",
    "Trajectory",
    "__version__",
    "simulate",
]
