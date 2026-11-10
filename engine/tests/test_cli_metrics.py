"""CLI smoke tests, performance budget, metrics and resource counters."""

from __future__ import annotations

import csv
import io
import json
import time
from pathlib import Path

import pytest

from qramsim import InputTerm, RunConfig, Trajectory, simulate
from qramsim.cli import main
from qramsim.config import input_terms
from qramsim.presets import get_preset
from qramsim.trajectory import validate


def test_performance_budget(tmp_path: Path) -> None:
    """PLAN.md Phase 0: n = 6, m = 4, uniform input, < 2 s with a valid trajectory."""
    out = tmp_path / "traj.json"
    t0 = time.perf_counter()
    code = main(
        [
            "run",
            "--variant",
            "basic",
            "--n",
            "6",
            "--m",
            "4",
            "--input",
            "uniform",
            "--out",
            str(out),
            "--quiet",
        ]
    )
    elapsed = time.perf_counter() - t0
    assert code == 0
    assert elapsed < 2.0, f"took {elapsed:.2f} s"
    data = json.loads(out.read_text(encoding="utf-8"))
    assert validate(data) == []
    assert data["final"]["metrics"]["fidelity"] > 1 - 1e-12
    assert len(data["frames"][0]["branches"]) == 64


def test_run_summary_and_export(tmp_path: Path, capsys) -> None:  # type: ignore[no-untyped-def]
    out = tmp_path / "e2.json"
    assert main(["run", "--preset", "E2", "--out", str(out)]) == 0
    text = capsys.readouterr().out
    assert "fidelity = 1" in text and "|11⟩ → 0 (expected 0)" in text
    csv_out = tmp_path / "events.csv"
    assert main(["export", str(out), "--format", "csv-events", "--out", str(csv_out)]) == 0
    rows = list(csv.DictReader(io.StringIO(csv_out.read_text(encoding="utf-8"))))
    assert rows and all(r["text"] for r in rows)
    pretty = tmp_path / "pretty.json"
    assert (
        main(["export", str(out), "--format", "json", "--indent", "1", "--out", str(pretty)]) == 0
    )
    assert Trajectory.load(pretty) == Trajectory.load(out)


def test_cli_inputs_and_errors(capsys) -> None:  # type: ignore[no-untyped-def]
    assert (
        main(
            [
                "run",
                "--n",
                "3",
                "--m",
                "2",
                "--address",
                "101,011",
                "--memory",
                "identity",
                "--copy-mode",
                "cell_switch",
                "--strict",
                "--no-frames",
            ]
        )
        == 0
    )
    assert main(["run", "--n", "2", "--m", "1", "--address", "10", "--memory", "0,0,1,0"]) == 0
    assert "|10⟩ → 1" in capsys.readouterr().out
    assert main(["run", "--n", "2", "--address", "102"]) == 2
    assert main(["run", "--preset", "nope"]) == 2
    assert main(["run", "--variant", "nope"]) == 2
    assert main(["run", "--variant", "backup", "--n", "2", "--m", "1", "--no-frames"]) == 0
    assert main(["presets"]) == 0
    assert "E1" in capsys.readouterr().out
    assert main(["presets", "--json"]) == 0
    assert json.loads(capsys.readouterr().out)[0]["name"] == "E1"


def test_entropy_and_metrics() -> None:
    e2 = simulate(get_preset("E2").config)
    assert abs(e2.metrics["entropy_AD"] - 1.0) < 1e-12  # two different data values
    same = simulate(RunConfig(n=2, m=1, terms=input_terms("uniform", 2), memory_fill="ones"))
    assert abs(same.metrics["entropy_AD"]) < 1e-12  # data uncorrelated with the address
    e1 = simulate(get_preset("E1").config)
    assert e1.metrics == {
        "fidelity": 1.0,
        "success": 1.0,
        "consistency": 1.0,
        "entropy_AD": 0.0,
        "norm": 1.0,
        "collided": 0.0,
        "discarded": 0.0,
    }


def test_resources_e1() -> None:
    res = simulate(get_preset("E1").config).resources
    assert res["K"] == 4
    assert res["sites_per_level"] == [4, 3, 4]
    assert (res["T_fwd"], res["T_q"], res["T_total"]) == (11, 1, 23)
    # Û⁽¹⁾ fires (A_1 red), Û⁽²⁾ does not (A_2 absent); one copy
    assert res["activations"]["routing"] == {"U": 1}
    assert res["activations"]["inverse"] == {"U": 1}
    assert res["activations"]["query"] == {"copy_global": 1}
    # three present walkers cross two levels of bifurcations, forward and backward
    assert res["S_crossings_expected"] == {"routing": 6.0, "inverse": 6.0}
    assert res["walkers_input"] == {"max": 3, "expected": 3.0}
    assert res["paper"]["gates"] == 6
    assert res["paper"]["sites_path"] == 2 + 1  # Σ_d (n + m − d) = 2 + 1


def test_resources_superposition_counts() -> None:
    res = simulate(
        RunConfig(n=2, m=1, terms=(InputTerm("00", 1), InputTerm("11", 1)), memory_fill="ones")
    ).resources
    assert res["walkers_input"] == {"max": 4, "expected": pytest.approx(3.0)}
    assert res["activations_expected"]["routing"]["U"] == pytest.approx(
        1.0
    )  # Û⁽¹⁾,Û⁽²⁾ fire in |11⟩ only


def test_cli_noise_and_sweep(tmp_path: Path, capsys) -> None:  # type: ignore[no-untyped-def]
    assert (
        main(["run", "--preset", "E2", "--noise", "loss:p=0.2:where=propagation", "--seed", "3"])
        == 0
    )
    assert "fidelity" in capsys.readouterr().out
    assert main(["run", "--preset", "E1", "--noise", "nope:p=0.1"]) == 2
    csv_path, png = tmp_path / "s.csv", tmp_path / "s.png"
    code = main(
        [
            "sweep",
            "--variant",
            "basic,backup",
            "--n",
            "2",
            "--m",
            "1",
            "--noise",
            "loss",
            "--values",
            "0,0.05",
            "--runs",
            "6",
            "--workers",
            "1",
            "--csv",
            str(csv_path),
            "--plot",
            str(png),
        ]
    )
    assert code == 0
    rows = list(csv.DictReader(io.StringIO(csv_path.read_text(encoding="utf-8"))))
    assert [r["label"] for r in rows] == ["basic", "basic", "backup", "backup"]
    assert float(rows[0]["fidelity"]) == 1.0
    assert png.stat().st_size > 1000


def test_cli_keeps_preset_seed_unless_given(capsys) -> None:  # type: ignore[no-untyped-def]
    from qramsim.cli import _config_from_args, build_parser

    args = build_parser().parse_args(["run", "--preset", "noise-demo"])
    assert _config_from_args(args).seed == 1  # the preset's own seed
    args = build_parser().parse_args(["run", "--preset", "noise-demo", "--seed", "9"])
    assert _config_from_args(args).seed == 9
