"""JSON entry points of the engine, without any web framework (DESIGN.md §3.7).

The HTTP server and the in-browser engine (Pyodide, ``viewer/src/engine/pyodide.worker.ts``)
are two doors to these functions, so they accept the same requests and give the same
answers. This module must stay importable with numpy alone: the browser build installs
the wheel without its server and plotting dependencies.
"""

from __future__ import annotations

import json
from typing import Any

from . import __version__
from .api import simulate
from .config import ConfigError, RunConfig
from .presets import PRESETS
from .schemas import RUN_JSON_SCHEMA, TRAJ_JSON_SCHEMA
from .simulator import EngineError
from .sweeps import run_ensemble

# Trajectories with frames grow like 2^n · n²; beyond this the viewer is not useful.
MAX_N_WITH_FRAMES = 7
MAX_ENSEMBLE_RUNS = 2000

# What a bad request raises; the two doors report it as a client error.
REQUEST_ERRORS = (ConfigError, EngineError, ValueError, KeyError, TypeError)


def health() -> dict[str, str]:
    return {"status": "ok", "version": __version__}


def presets() -> list[dict[str, Any]]:
    return [
        {
            "name": p.name,
            "title": p.title,
            "description": p.description,
            "config": p.config.to_dict(),
        }
        for p in PRESETS.values()
    ]


def schema() -> dict[str, Any]:
    return {"run": RUN_JSON_SCHEMA, "traj": TRAJ_JSON_SCHEMA}


def simulate_json(body: dict[str, Any]) -> str:
    """``RunConfig`` JSON → trajectory JSON text."""
    cfg = RunConfig.from_dict(body)
    if cfg.record.frames and cfg.n > MAX_N_WITH_FRAMES:
        raise ConfigError(
            f"n = {cfg.n} is too large to record frames for the viewer "
            f"(maximum {MAX_N_WITH_FRAMES}); disable record.frames"
        )
    return simulate(cfg).trajectory.to_json()


def ensemble(body: dict[str, Any]) -> dict[str, Any]:
    """``{config, runs, seed0}`` → mean, std and standard error of the metrics."""
    cfg = RunConfig.from_dict(body.get("config", {}))
    runs = int(body.get("runs", 100))
    if not 1 <= runs <= MAX_ENSEMBLE_RUNS:
        raise ConfigError(f"runs must be between 1 and {MAX_ENSEMBLE_RUNS}")
    if cfg.n > MAX_N_WITH_FRAMES:
        raise ConfigError(f"n = {cfg.n} is too large for an interactive ensemble")
    return run_ensemble(cfg, runs, int(body.get("seed0", 0))).to_dict()


def call(method: str, payload: str = "null") -> str:
    """Single door for the in-browser engine: JSON text in, ``{"ok", "result"|"error"}`` out."""
    try:
        body = json.loads(payload)
        if method == "simulate":
            return f'{{"ok":true,"result":{simulate_json(body)}}}'
        result: Any
        if method == "health":
            result = health()
        elif method == "presets":
            result = presets()
        elif method == "schema":
            result = schema()
        elif method == "ensemble":
            result = ensemble(body)
        else:
            raise ValueError(f"unknown method {method!r}")
        return json.dumps({"ok": True, "result": result}, ensure_ascii=False)
    except REQUEST_ERRORS as exc:
        return json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False)
