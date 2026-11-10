"""Exports and the framework-free web API (PLAN.md Phase 5).

The browser build imports ``qramsim.webapi`` with numpy alone; the HTTP server and the
in-browser engine answer alike. The rendering commands check their inputs and tools; an
integration test drives the real pipeline where Node, ffmpeg and the viewer are available.
"""

from __future__ import annotations

import json
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Any

import pytest
from fastapi.testclient import TestClient

from qramsim import webapi
from qramsim.cli import _size, main
from qramsim.config import ConfigError
from qramsim.presets import get_preset
from qramsim.render import RenderError, RenderOptions, needs_build, render_figure, render_video
from qramsim.server import create_app

E1 = get_preset("E1").config.to_dict()


def test_webapi_needs_numpy_only() -> None:
    code = (
        "import sys, qramsim.webapi; "
        "print(sorted({'fastapi','uvicorn','starlette','matplotlib'} & set(sys.modules)))"
    )
    out = subprocess.run([sys.executable, "-c", code], capture_output=True, text=True, check=True)
    assert out.stdout.strip() == "[]"


def test_call_answers_every_method() -> None:
    assert json.loads(webapi.call("health"))["result"]["status"] == "ok"
    names = [p["name"] for p in json.loads(webapi.call("presets"))["result"]]
    assert {"E1", "E2", "E3", "E4", "qudit-short", "dualrail"} <= set(names)
    assert "run" in json.loads(webapi.call("schema"))["result"]
    reply = json.loads(webapi.call("simulate", json.dumps(E1)))
    assert reply["ok"] and reply["result"]["final"]["metrics"]["fidelity"] > 1 - 1e-12
    noisy = dict(E1, noise=[{"model": "loss", "p": 0.05}])
    body = json.dumps({"config": noisy, "runs": 4, "seed0": 1})
    assert json.loads(webapi.call("ensemble", body))["result"]["runs"] == 4


@pytest.mark.parametrize(
    ("method", "payload", "message"),
    [
        ("nope", "null", "unknown method"),
        ("simulate", json.dumps(dict(E1, variant="nope")), "not implemented"),
        ("simulate", json.dumps(dict(E1, n=8)), "too large"),
        ("ensemble", json.dumps({"config": E1, "runs": 0}), "runs must be"),
    ],
)
def test_call_reports_bad_requests(method: str, payload: str, message: str) -> None:
    reply = json.loads(webapi.call(method, payload))
    assert reply["ok"] is False
    assert message in reply["error"]


def test_server_and_browser_engine_agree() -> None:
    client = TestClient(create_app())
    assert client.get("/api/presets").json() == json.loads(webapi.call("presets"))["result"]
    http = client.post("/api/simulate", json=E1).json()
    browser = json.loads(webapi.call("simulate", json.dumps(E1)))["result"]
    assert http == browser
    bad = client.post("/api/simulate", json=dict(E1, n=8))
    assert bad.status_code == 400
    assert (
        bad.json()["detail"]
        == json.loads(webapi.call("simulate", json.dumps(dict(E1, n=8))))["error"]
    )


def test_ensemble_runs_without_processes_on_emscripten(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(sys, "platform", "emscripten")
    noisy = dict(E1, noise=[{"model": "loss", "p": 0.05}])
    result = webapi.ensemble({"config": noisy, "runs": 32})  # above the process-pool threshold
    assert result["runs"] == 32


# -- rendering: inputs and tools ---------------------------------------------------------


def test_size_argument() -> None:
    assert _size("1280x720") == (1280, 720)
    with pytest.raises(ConfigError):
        _size("wide")


def test_render_rejects_unknown_formats(tmp_path: Path) -> None:
    traj = None  # never reached: the format is checked first
    with pytest.raises(RenderError, match="unknown video format"):
        render_video(traj, tmp_path / "a.avi", RenderOptions())  # type: ignore[arg-type]
    with pytest.raises(RenderError, match="unknown figure format"):
        render_figure(traj, tmp_path / "a.pdf", RenderOptions())  # type: ignore[arg-type]
    with pytest.raises(RenderError, match="positive"):
        render_video(traj, tmp_path / "a.mp4", RenderOptions(), duration=0)  # type: ignore[arg-type]


def test_missing_ffmpeg_is_reported(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(shutil, "which", lambda _: None)
    with pytest.raises(RenderError, match="ffmpeg"):
        render_video(None, tmp_path / "a.mp4", RenderOptions())  # type: ignore[arg-type]


def test_cli_reports_render_errors(tmp_path: Path, capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["figure", "--preset", "E1", "--out", str(tmp_path / "a.pdf")]) == 2
    assert "unknown figure format" in capsys.readouterr().err


def test_app_builds_serves_and_opens(monkeypatch: pytest.MonkeyPatch) -> None:
    import threading

    import uvicorn

    import qramsim.render as render

    built: list[Path] = []
    served: list[tuple[str, int]] = []
    opened: list[Any] = []

    class NoTimer:
        def __init__(self, _delay: float, fn: Any, args: list[str]) -> None:
            opened.append((fn, args))

        def start(self) -> None:
            pass

    monkeypatch.setattr(render, "ensure_built", built.append)
    monkeypatch.setattr(uvicorn, "run", lambda _app, host, port, **_: served.append((host, port)))
    monkeypatch.setattr(threading, "Timer", NoTimer)
    assert main(["app", "--port", "8791"]) == 0
    assert built and served == [("127.0.0.1", 8791)]
    assert opened[0][1] == ["http://127.0.0.1:8791/"]
    opened.clear()
    assert main(["app", "--port", "8791", "--no-browser"]) == 0
    assert not opened


def test_app_reports_a_busy_port(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import socket

    import qramsim.render as render

    monkeypatch.setattr(render, "ensure_built", lambda _: None)
    with socket.socket() as taken:
        taken.bind(("127.0.0.1", 0))
        taken.listen()
        port = taken.getsockname()[1]
        assert main(["app", "--port", str(port), "--no-browser"]) == 2
    assert "busy" in capsys.readouterr().err


def test_missing_pnpm_points_to_the_install_guide(
    monkeypatch: pytest.MonkeyPatch, tmp_path: Path
) -> None:
    from qramsim.render import ensure_built

    (tmp_path / "src").mkdir()
    real = shutil.which
    monkeypatch.setattr(shutil, "which", lambda t: None if t == "pnpm" else real(t))
    with pytest.raises(RenderError, match=r"INSTALL\.md"):
        ensure_built(tmp_path)


def test_needs_build(tmp_path: Path) -> None:
    viewer = tmp_path / "viewer"
    (viewer / "src").mkdir(parents=True)
    source = viewer / "src" / "a.ts"
    source.write_text("x")
    assert needs_build(viewer)  # nothing built yet
    (viewer / "dist").mkdir()
    index = viewer / "dist" / "index.html"
    index.write_text("<html>")
    import os

    os.utime(source, (1000, 1000))
    os.utime(index, (2000, 2000))
    assert not needs_build(viewer)
    os.utime(source, (3000, 3000))
    assert needs_build(viewer)


# -- the real pipeline, where its tools exist -----------------------------------------------

ROOT = Path(__file__).resolve().parents[2]
HAS_VIEWER = (ROOT / "viewer" / "node_modules" / "@playwright" / "test").is_dir()
needs_tools = pytest.mark.skipif(
    not (HAS_VIEWER and shutil.which("node") and shutil.which("ffmpeg") and shutil.which("pnpm")),
    reason="needs the viewer's dependencies, Node, pnpm and ffmpeg",
)


@needs_tools
def test_video_end_to_end(tmp_path: Path) -> None:
    out = tmp_path / "e1.mp4"
    args = ["video", "--preset", "E1", "--theme", "talk", "--out", str(out)]
    assert main([*args, "--duration", "1", "--fps", "6", "--size", "640x360"]) == 0
    probe = subprocess.run(
        [
            "ffprobe",
            "-v",
            "error",
            "-show_entries",
            "stream=codec_name,width,height,nb_frames",
            "-of",
            "json",
            str(out),
        ],
        capture_output=True,
        text=True,
        check=True,
    )
    stream = json.loads(probe.stdout)["streams"][0]
    assert stream["codec_name"] == "h264"
    assert (stream["width"], stream["height"]) == (640, 360)
    assert int(stream["nb_frames"]) == 6


@needs_tools
@pytest.mark.parametrize(
    ("name", "marker"), [("f.svg", b"<svg"), ("f.png", b"PNG"), ("f.tex", b"tikzpicture")]
)
def test_figure_end_to_end(tmp_path: Path, name: str, marker: bytes) -> None:
    out = tmp_path / name
    args = ["figure", "--preset", "dualrail", "--tick", "13", "--figure-mode", "--out", str(out)]
    assert main(args) == 0
    assert marker in out.read_bytes()[:4000]
