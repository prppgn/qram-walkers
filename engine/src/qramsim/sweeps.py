"""Ensemble runs and parameter sweeps of noisy configurations (DESIGN.md §4.4).

An ensemble repeats one configuration with seeds ``seed0, seed0 + 1, …`` (frames off)
and averages the metrics; the quantum-jump unravelling makes these averages exact
estimates of the channel's action. A sweep runs ensembles along one noise parameter for
several configurations and can draw the curves with matplotlib.
"""

from __future__ import annotations

import csv
import math
import os
import sys
from collections.abc import Sequence
from dataclasses import dataclass, replace
from pathlib import Path
from typing import Any

from .api import simulate
from .config import RecordOptions, RunConfig

METRICS = ("fidelity", "success", "consistency", "entropy_AD", "collided", "discarded")
HERALDED = "heralded_fidelity"  # ⟨F⟩/⟨success⟩: the fidelity given a well-formed output (D35)


def _one(job: tuple[RunConfig, int]) -> dict[str, float]:
    cfg, seed = job
    result = simulate(replace(cfg, seed=seed, record=RecordOptions(frames=False)))
    out = {k: float(result.metrics[k]) for k in METRICS}
    out["noise_events"] = float(sum(result.counters.noise_events.values()))
    return out


@dataclass(frozen=True)
class EnsembleResult:
    runs: int
    seed0: int
    mean: dict[str, float]
    std: dict[str, float]
    sem: dict[str, float]

    def to_dict(self) -> dict[str, Any]:
        def known(d: dict[str, float]) -> dict[str, float]:  # JSON has no NaN
            return {k: v for k, v in d.items() if not math.isnan(v)}

        return {
            "runs": self.runs,
            "seed0": self.seed0,
            "mean": known(self.mean),
            "std": known(self.std),
            "sem": known(self.sem),
        }


def _aggregate(samples: list[dict[str, float]], seed0: int) -> EnsembleResult:
    n = len(samples)
    keys = samples[0].keys() if samples else ()
    mean = {k: sum(s[k] for s in samples) / n for k in keys}
    var = {k: sum((s[k] - mean[k]) ** 2 for s in samples) / max(1, n - 1) for k in keys}
    std = {k: math.sqrt(v) for k, v in var.items()}
    sem = {k: std[k] / math.sqrt(n) for k in keys}
    if "fidelity" in mean and "success" in mean:
        _add_heralded(samples, mean, std, sem)
    return EnsembleResult(n, seed0, mean, std, sem)


def _add_heralded(
    samples: list[dict[str, float]],
    mean: dict[str, float],
    std: dict[str, float],
    sem: dict[str, float],
) -> None:
    """``R = ⟨F⟩/⟨success⟩`` (undefined, NaN, if no output is ever well formed), with the error
    of a ratio of means: the spread of ``(F − R·success)/⟨success⟩`` over the runs."""
    n = len(samples)
    if mean["success"] <= 0:
        mean[HERALDED] = std[HERALDED] = sem[HERALDED] = math.nan
        return
    ratio = mean["fidelity"] / mean["success"]
    residuals = [(s["fidelity"] - ratio * s["success"]) / mean["success"] for s in samples]
    centre = sum(residuals) / n
    spread = math.sqrt(sum((r - centre) ** 2 for r in residuals) / max(1, n - 1))
    mean[HERALDED] = ratio
    std[HERALDED] = spread
    sem[HERALDED] = spread / math.sqrt(n)


def run_ensemble(
    config: RunConfig, runs: int, seed0: int = 0, workers: int | None = None
) -> EnsembleResult:
    """Average the metrics of ``runs`` trajectories with consecutive seeds."""
    if runs < 1:
        raise ValueError("an ensemble needs at least one run")
    jobs = [(config, seed0 + i) for i in range(runs)]
    workers = workers if workers is not None else min(os.cpu_count() or 1, 8)
    if workers <= 1 or runs < 16 or sys.platform == "emscripten":  # no processes in Pyodide
        samples = [_one(j) for j in jobs]
    else:
        from concurrent.futures import ProcessPoolExecutor

        with ProcessPoolExecutor(max_workers=workers) as pool:
            samples = list(pool.map(_one, jobs, chunksize=max(1, runs // (4 * workers))))
    return _aggregate(samples, seed0)


def with_noise_param(config: RunConfig, channel: int, param: str, value: float) -> RunConfig:
    noise = [dict(x) for x in config.noise]
    noise[channel][param] = value
    return replace(config, noise=tuple(noise))


def sweep(
    configs: dict[str, RunConfig],
    param: str,
    values: Sequence[float],
    runs: int,
    channel: int = 0,
    seed0: int = 0,
    workers: int | None = None,
) -> list[dict[str, Any]]:
    """One ensemble per (configuration, value) of ``noise[channel][param]``."""
    rows = []
    for label, cfg in configs.items():
        for v in values:
            ens = run_ensemble(with_noise_param(cfg, channel, param, v), runs, seed0, workers)
            row: dict[str, Any] = {"label": label, "param": param, "value": v, "runs": runs}
            for k in (*METRICS, HERALDED):
                row[k] = ens.mean[k]
                row[f"{k}_sem"] = ens.sem[k]
            rows.append(row)
    return rows


def write_csv(rows: list[dict[str, Any]], path: str | Path) -> None:
    if not rows:
        return
    with Path(path).open("w", newline="", encoding="utf-8") as fh:
        writer = csv.DictWriter(fh, fieldnames=list(rows[0]))
        writer.writeheader()
        writer.writerows(rows)


def plot_sweep(
    rows: list[dict[str, Any]], path: str | Path, metric: str = "fidelity", title: str = ""
) -> None:
    import matplotlib

    matplotlib.use("Agg")
    import matplotlib.pyplot as plt

    fig, ax = plt.subplots(figsize=(6.4, 4.2), dpi=150)
    labels = list(dict.fromkeys(r["label"] for r in rows))
    for label in labels:
        pts = [r for r in rows if r["label"] == label]
        xs = [r["value"] for r in pts]
        ys = [r[metric] for r in pts]
        es = [r[f"{metric}_sem"] for r in pts]
        ax.errorbar(xs, ys, yerr=es, marker="o", ms=3.5, capsize=2, lw=1.4, label=label)
    param = rows[0]["param"] if rows else ""
    ax.set_xlabel(param)
    ax.set_ylabel(f"mean {metric}")
    ax.set_ylim(-0.02, 1.02)
    ax.grid(alpha=0.3)
    ax.legend(frameon=True, framealpha=0.85, edgecolor="none")
    if title:
        import textwrap

        ax.set_title("\n".join(textwrap.wrap(title, 72)), fontsize=9)
    fig.tight_layout()
    fig.savefig(path)
    plt.close(fig)
