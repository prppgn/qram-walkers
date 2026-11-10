"""Headless video and figure exports (PLAN.md Phase 5, DESIGN.md §7.6).

The engine computes the trajectory; the built viewer draws it in a browser driven by
Playwright (``viewer/scripts/render.mjs``), and ffmpeg assembles the video. Everything is
rendering: the same trajectory the interactive viewer would show. These commands need
a source checkout, Node with pnpm and, for videos, ffmpeg; the viewer's dependencies are
installed and the viewer is built when needed (also for ``qramsim app``).
"""

from __future__ import annotations

import functools
import shutil
import subprocess
import tempfile
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from dataclasses import dataclass
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any

from .trajectory import Trajectory


class RenderError(ValueError):
    """A missing tool or a failed rendering (reported as a command-line error)."""


@dataclass(frozen=True)
class RenderOptions:
    theme: str = "paper"
    width: int = 1920
    height: int = 1080
    figure: bool = False
    orientation: str = "horizontal"


def find_viewer() -> Path:
    """``viewer/`` of the source checkout this package runs from."""
    for parent in Path(__file__).resolve().parents:
        candidate = parent / "viewer"
        if (candidate / "scripts" / "render.mjs").is_file():
            return candidate
    raise RenderError("video and figure exports need a source checkout with the viewer/ folder")


def _newest(paths: list[Path]) -> float:
    return max(
        (f.stat().st_mtime for p in paths if p.exists() for f in p.rglob("*") if f.is_file()),
        default=0.0,
    )


def needs_build(viewer: Path) -> bool:
    """True when ``viewer/dist`` is missing or older than the sources it is built from."""
    index = viewer / "dist" / "index.html"
    if not index.exists():
        return True
    sources = [viewer / "src", viewer.parent / "docs" / "user-guide"]
    return _newest(sources) > index.stat().st_mtime


def _require(tool: str, hint: str) -> None:
    if shutil.which(tool) is None:
        raise RenderError(f"{tool} not found on PATH: {hint}")


def _pnpm(viewer: Path, *args: str) -> None:
    """Run pnpm in the viewer's folder, showing its output only if it fails."""
    pnpm = shutil.which("pnpm")
    if pnpm is None:
        raise RenderError("pnpm not found on PATH: needed to build the interface (see INSTALL.md)")
    result = subprocess.run([pnpm, *args], cwd=viewer, capture_output=True, text=True)
    if result.returncode != 0:
        raise RenderError(f"pnpm {args[0]} failed:\n{result.stdout}\n{result.stderr}")


def ensure_built(viewer: Path) -> None:
    """Install the viewer's dependencies and build it, if that has not been done yet."""
    if not (viewer / "node_modules" / "@playwright" / "test").is_dir():
        _require("node", "needed to build the interface (see INSTALL.md)")
        print("installing the interface's dependencies…", flush=True)
        _pnpm(viewer, "install", "--frozen-lockfile")
    if needs_build(viewer):
        print("building the interface…", flush=True)
        _pnpm(viewer, "build")


class _QuietHandler(SimpleHTTPRequestHandler):
    def log_message(self, format: str, *args: Any) -> None:
        pass


@contextmanager
def _serve(directory: Path) -> Iterator[str]:
    """Serve a directory on a free local port for the duration of the block."""
    handler = functools.partial(_QuietHandler, directory=str(directory))
    server = ThreadingHTTPServer(("127.0.0.1", 0), handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_address[1]}/"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


def _run_script(
    trajectory: Trajectory, out: Path, mode: str, opts: RenderOptions, *extra: str
) -> None:
    _require("node", "needed to drive the browser (see INSTALL.md)")
    viewer = find_viewer()
    ensure_built(viewer)
    out.parent.mkdir(parents=True, exist_ok=True)
    with (
        tempfile.TemporaryDirectory(prefix="qramsim-render-") as tmp,
        _serve(viewer / "dist") as url,
    ):
        traj_path = Path(tmp) / "trajectory.json"
        traj_path.write_text(trajectory.to_json(), encoding="utf-8")
        command = [
            shutil.which("node") or "node",
            "scripts/render.mjs",
            f"--url={url}",
            f"--traj={traj_path}",
            f"--mode={mode}",
            f"--out={out.resolve()}",
            f"--theme={opts.theme}",
            f"--width={opts.width}",
            f"--height={opts.height}",
            f"--orientation={opts.orientation}",
            *(["--figure"] if opts.figure else []),
            *extra,
        ]
        result = subprocess.run(command, cwd=viewer)
    if result.returncode != 0:
        raise RenderError(f"the renderer failed with exit code {result.returncode}")


def render_video(
    trajectory: Trajectory,
    out: Path,
    opts: RenderOptions,
    duration: float = 20.0,
    fps: int = 30,
    hold: float = 1.0,
) -> None:
    """Write an MP4 or GIF (by extension) of the whole trajectory."""
    if out.suffix.lower() not in (".mp4", ".gif"):
        raise RenderError(f"unknown video format {out.suffix!r}: use .mp4 or .gif")
    if duration <= 0 or fps < 1:
        raise RenderError("the duration and the frame rate must be positive")
    _require("ffmpeg", "needed to assemble the video (brew install ffmpeg)")
    extra = (f"--duration={duration}", f"--fps={fps}", f"--hold={hold}")
    _run_script(trajectory, out, "video", opts, *extra)


def render_figure(
    trajectory: Trajectory,
    out: Path,
    opts: RenderOptions,
    tick: int | None = None,
    scale: float = 3.0,
) -> None:
    """Write one frame as SVG, PNG or TikZ (by extension). ``tick`` −1 is the input state;
    the default is the last tick."""
    if out.suffix.lower() not in (".svg", ".png", ".tex"):
        raise RenderError(f"unknown figure format {out.suffix!r}: use .svg, .png or .tex")
    extra = [f"--scale={scale}"]
    if tick is not None:
        extra.append(f"--tick={tick}")
    _run_script(trajectory, out, "figure", opts, *extra)
