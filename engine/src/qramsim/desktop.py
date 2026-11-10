"""qram-walkers as a desktop application (D37): what the installers run.

The installers bundle this module with a built viewer. It serves the interface on a free local
port and shows it in a window of its own on macOS and Windows (pywebview: the system's WebKit
or WebView2), where closing the window stops the app. Elsewhere, or with ``--browser``, it opens
the default browser and stops by itself shortly after its page is closed: each open page holds
``/api/session`` (see :class:`qramsim.server.PageWatch`).

From a source checkout: ``uv run --extra desktop qramsim desktop``.
"""

from __future__ import annotations

import argparse
import base64
import json
import os
import socket
import sys
import threading
import time
import urllib.request
import webbrowser
from pathlib import Path
from typing import IO, TYPE_CHECKING, Any

from . import __version__
from .config import ConfigError

if TYPE_CHECKING:  # the server's modules load only when the app starts, not with the CLI
    from .server import PageWatch

TITLE = "qram-walkers"
# Browser mode: seconds the app waits after its last page was closed (a reload reconnects
# well within it), and for the first page to open.
GRACE = 20.0
FIRST_PAGE = 300.0


def bundled_viewer() -> Path | None:
    """The built interface: inside the bundle, or ``viewer/dist`` of a source checkout."""
    from .server import default_static_dir

    base = getattr(sys, "_MEIPASS", None)
    if base is not None:
        return Path(base) / "viewer"
    return default_static_dir()


def user_dir(kind: str) -> Path:
    """Per-user folder of the app: ``kind`` is "logs" or "data"."""
    home = Path.home()
    if sys.platform == "darwin":
        if kind == "logs":
            return home / "Library" / "Logs" / TITLE
        return home / "Library" / "Application Support" / TITLE
    if os.name == "nt":
        return Path(os.environ.get("LOCALAPPDATA", home / "AppData" / "Local")) / TITLE / kind
    root = os.environ.get("XDG_STATE_HOME" if kind == "logs" else "XDG_DATA_HOME")
    default = home / ".local" / ("state" if kind == "logs" else "share")
    return Path(root or default) / TITLE


def _console() -> IO[str] | None:
    """A windowed app has no console: then its messages go to a log file."""
    if sys.stdout is not None and sys.stderr is not None:
        return None
    folder = user_dir("logs")
    folder.mkdir(parents=True, exist_ok=True)
    log = (folder / f"{TITLE}.log").open("a", encoding="utf-8", buffering=1)
    sys.stdout = sys.stdout or log
    sys.stderr = sys.stderr or log
    return log


class Server:
    """The engine's HTTP server on a free local port, in a background thread."""

    def __init__(self, static: Path, watch: PageWatch | None = None) -> None:
        import uvicorn

        from .server import create_app

        self.sock = socket.socket()
        self.sock.bind(("127.0.0.1", 0))
        self.url = f"http://127.0.0.1:{self.sock.getsockname()[1]}/"
        config = uvicorn.Config(
            create_app(static, watch=watch),
            log_config=None,
            log_level="warning",
            loop="asyncio",
            http="h11",
            ws="none",
            lifespan="off",
        )
        self.server = uvicorn.Server(config)
        self.thread = threading.Thread(
            target=self.server.run, kwargs={"sockets": [self.sock]}, daemon=True
        )

    def start(self, timeout: float = 30.0) -> None:
        self.thread.start()
        deadline = time.monotonic() + timeout
        while not self.server.started:
            if not self.thread.is_alive() or time.monotonic() > deadline:
                raise ConfigError("the engine's server did not start")
            time.sleep(0.02)

    def stop(self) -> None:
        self.server.should_exit = True
        self.thread.join(timeout=10)
        self.sock.close()


class DesktopApi:
    """What the page may ask of the window (``window.pywebview.api``): saving an export.

    Names that start with an underscore are not shown to the page.
    """

    def __init__(self) -> None:
        self._window: Any = None

    def save_file(self, name: str, data: str) -> str | None:
        """Ask where to save `name` and write `data` (base64) there; None if cancelled."""
        import webview

        dialog = getattr(webview, "FileDialog", None)
        kind = dialog.SAVE if dialog is not None else webview.SAVE_DIALOG
        chosen = self._window.create_file_dialog(kind, save_filename=Path(name).name)
        if not chosen:
            return None
        path = Path(chosen if isinstance(chosen, str) else chosen[0])
        path.write_bytes(base64.b64decode(data))
        return str(path)


def has_window() -> bool:
    """Whether this system shows the interface in a window of its own."""
    if sys.platform not in ("darwin", "win32"):
        return False
    try:
        import webview  # noqa: F401
    except ImportError:
        return False
    return True


def run_window(server: Server) -> None:
    """The interface in its own window; returns when the window is closed."""
    import webview

    api = DesktopApi()
    window = webview.create_window(
        TITLE, server.url, js_api=api, width=1440, height=900, min_size=(960, 640)
    )
    api._window = window
    data = user_dir("data")
    data.mkdir(parents=True, exist_ok=True)
    # Not private: the page keeps its settings (the theme) from one run to the next. On
    # Windows only WebView2 runs the interface; without it, start() fails and main() falls
    # back to the browser.
    webview.start(
        gui="edgechromium" if sys.platform == "win32" else None,
        private_mode=False,
        storage_path=str(data),
    )


def run_browser(
    server: Server, watch: PageWatch, grace: float = GRACE, first: float = FIRST_PAGE
) -> None:
    """The interface in the default browser; returns once no page has been open for `grace`."""
    print(f"qram-walkers is running at {server.url}", flush=True)
    print("It stops by itself a few seconds after you close its page.", flush=True)
    webbrowser.open(server.url)
    while server.thread.is_alive():
        seen, idle = watch.state()
        if idle > (grace if seen else first):
            return
        time.sleep(0.25)


def _get(url: str) -> Any:
    with urllib.request.urlopen(url, timeout=30) as reply:
        return json.load(reply)


def self_test(server: Server) -> str:
    """Check the bundle without a screen: the page, the API and one exact run (E2)."""
    with urllib.request.urlopen(server.url, timeout=30) as reply:
        page = reply.read().decode("utf-8")
    if 'id="root"' not in page:
        raise ConfigError("the interface is missing from the bundle")
    health = _get(server.url + "api/health")
    if health.get("status") != "ok":
        raise ConfigError(f"unexpected health reply: {health}")
    preset = next(p for p in _get(server.url + "api/presets") if p["name"] == "E2")
    request = urllib.request.Request(
        server.url + "api/simulate",
        data=json.dumps(preset["config"]).encode(),
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=60) as reply:
        fidelity = json.load(reply)["final"]["metrics"]["fidelity"]
    if abs(fidelity - 1) > 1e-12:
        raise ConfigError(f"E2 returned fidelity {fidelity}")
    return f"qram-walkers {health['version']}: interface served, E2 fidelity {fidelity:.12f}"


def window_test(server: Server, timeout: float = 60.0) -> str:
    """Open a hidden window, wait until the interface has drawn and the save door is there."""
    import webview

    outcome: dict[str, Any] = {}
    probe_js = (
        "document.getElementById('root').childElementCount > 0"
        " && !!(window.pywebview && window.pywebview.api && window.pywebview.api.save_file)"
    )

    def probe(window: Any) -> None:
        deadline = time.monotonic() + timeout
        try:
            while time.monotonic() < deadline:
                if window.evaluate_js(probe_js):
                    outcome["ok"] = True
                    return
                time.sleep(0.5)
        except Exception as exc:  # reported below
            outcome["error"] = repr(exc)
        finally:
            window.destroy()

    api = DesktopApi()
    window = webview.create_window(TITLE, server.url, js_api=api, hidden=True)
    api._window = window
    webview.start(probe, (window,))
    if not outcome.get("ok"):
        raise ConfigError(f"the window did not show the interface: {outcome}")
    return "the window shows the interface"


def add_arguments(p: argparse.ArgumentParser) -> None:
    """The app's options, shared with ``qramsim desktop``."""
    p.add_argument(
        "--browser",
        action="store_true",
        help="open the interface in the default browser instead of a window of its own",
    )
    p.add_argument(
        "--self-test",
        nargs="?",
        const="server",
        choices=["server", "window"],
        help="check the installation and exit: the server and one run, or also a hidden window",
    )


def build_parser() -> argparse.ArgumentParser:
    p = argparse.ArgumentParser(
        prog=TITLE, description="qram-walkers: simulator of the quantum-walker quantum RAM."
    )
    add_arguments(p)
    p.add_argument("--version", action="version", version=f"{TITLE} {__version__}")
    return p


def main(argv: list[str] | None = None) -> int:
    # Parse only what is ours: macOS may add its own arguments to an app it starts.
    args, _ = build_parser().parse_known_args(argv)
    return run(args)


def run(args: argparse.Namespace) -> int:
    log = _console()
    try:
        static = bundled_viewer()
        if static is None or not (static / "index.html").is_file():
            raise ConfigError("the built interface was not found (in a checkout: pnpm build)")
        from .server import PageWatch

        window = not args.browser and has_window()
        watch = None if window or args.self_test else PageWatch()
        server = Server(static, watch)
        server.start()
        try:
            if args.self_test:
                print(self_test(server), flush=True)
                if args.self_test == "window":
                    print(window_test(server), flush=True)
            elif window:
                try:
                    run_window(server)
                except Exception as exc:  # no usable web view: the browser instead
                    print(f"{TITLE}: no window ({exc!r}); opening the browser", file=sys.stderr)
                    watch = PageWatch()
                    server.stop()
                    server = Server(static, watch)
                    server.start()
                    run_browser(server, watch)
            else:
                assert watch is not None
                run_browser(server, watch)
        finally:
            server.stop()
    except ConfigError as exc:
        print(f"{TITLE}: error: {exc}", file=sys.stderr, flush=True)
        return 1
    finally:
        if log is not None:
            log.close()
    return 0


if __name__ == "__main__":
    sys.exit(main())
