"""Starting the app (D36): a running instance is reused, the launchers, the shortcuts."""

from __future__ import annotations

import json
import plistlib
import re
import shlex
import subprocess
import sys
import threading
import webbrowser
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path
from typing import Any

import pytest

from qramsim.cli import main
from qramsim.config import ConfigError
from qramsim.shortcut import BUNDLE_ID, applescript, desktop_entry, make_shortcut

ROOT = Path(__file__).resolve().parents[2]


class Health(BaseHTTPRequestHandler):
    def do_GET(self) -> None:
        body = json.dumps({"status": "ok", "version": "test"}).encode()
        self.send_response(200 if self.path == "/api/health" else 404)
        self.send_header("content-type", "application/json")
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *_: Any) -> None:
        pass


def test_app_opens_a_running_instance(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    import qramsim.render as render

    server = HTTPServer(("127.0.0.1", 0), Health)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    port = server.server_address[1]
    built: list[Path] = []
    opened: list[str] = []
    monkeypatch.setattr(render, "ensure_built", built.append)
    monkeypatch.setattr(webbrowser, "open", opened.append)
    try:
        assert main(["app", "--port", str(port)]) == 0
        assert main(["app", "--port", str(port), "--no-browser"]) == 0
    finally:
        server.shutdown()
        server.server_close()
    assert opened == [f"http://127.0.0.1:{port}/"]
    assert not built
    assert "already running" in capsys.readouterr().out


def test_app_starts_right_after_a_stop(monkeypatch: pytest.MonkeyPatch) -> None:
    """A port whose last connection is still closing (TIME_WAIT) is free for the app."""
    import socket

    import uvicorn

    import qramsim.render as render

    with socket.socket() as old:
        # As the server does (asyncio sets it on POSIX); Linux reuses a closing port only if
        # both the old socket and the new one ask for it.
        old.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        old.bind(("127.0.0.1", 0))
        old.listen()
        port = old.getsockname()[1]
        client = socket.create_connection(("127.0.0.1", port))
        accepted, _ = old.accept()
        accepted.close()  # the server side closes first, so it is the one left in TIME_WAIT
        client.close()
    served: list[int] = []
    monkeypatch.setattr(render, "ensure_built", lambda _: None)
    monkeypatch.setattr(uvicorn, "run", lambda _app, host, port, **_: served.append(port))
    assert main(["app", "--port", str(port), "--no-browser"]) == 0
    assert served == [port]


@pytest.mark.parametrize("name", ["qram-walkers.command", "qram-walkers.sh"])
def test_unix_launchers_start_the_app(name: str) -> None:
    path = ROOT / name
    assert path.stat().st_mode & 0o111, f"{name} is not executable"
    text = path.read_bytes()
    assert text.startswith(b"#!/bin/bash\n") and b"\r\n" not in text
    assert b'cd "$(dirname "$0")/engine"' in text and b"uv run qramsim app" in text


def test_windows_launcher_starts_the_app() -> None:
    text = (ROOT / "qram-walkers.bat").read_bytes()
    assert text.count(b"\r\n") == text.count(b"\n") > 0
    assert b'cd /d "%~dp0engine"' in text and b"uv run qramsim app" in text


def test_applet_quotes_paths(tmp_path: Path) -> None:
    engine = Path('/tmp/a "quoted" dir/engine')
    source = applescript(engine, "/opt/my bin/uv", "/usr/bin:/bin", 8799, Path("/tmp/l d/q.log"))
    match = re.search(r'set serverPID to do shell script "((?:[^"\\]|\\.)*)"', source)
    assert match
    shell = re.sub(r"\\(.)", r"\1", match.group(1))
    assert shlex.split(shell.split(" > ")[0]) == [
        "PATH=/usr/bin:/bin", "nohup", "/opt/my bin/uv", "run", "--directory", str(engine),
        "qramsim", "app", "--no-browser", "--port", "8799",
    ]  # fmt: skip
    assert source.count('open location "http://127.0.0.1:8799/"') == 2  # when up, on reopen
    assert "quit\n" not in source.split("on idle")[0]  # it stays open while the app is used
    if sys.platform == "darwin":
        script = tmp_path / "launcher.applescript"
        script.write_text(source, encoding="utf-8")
        subprocess.run(["osacompile", "-o", str(tmp_path / "s.scpt"), str(script)], check=True)


def test_desktop_entry_quotes_the_command() -> None:
    text = desktop_entry(Path("/home/u/my $dir%/engine"), "/home/u/bin/uv", Path("/i.png"), 8765)
    exec_line = next(line for line in text.splitlines() if line.startswith("Exec="))[5:]
    # Undo the escaping layers of the Desktop Entry Specification: field codes, string, quoting.
    unescaped = exec_line.replace("%%", "%").replace("\\\\", "\\")
    args = [
        re.sub(r"\\(.)", r"\1", quoted) if quoted else bare
        for quoted, bare in re.findall(r'"((?:[^"\\]|\\.)*)"|(\S+)', unescaped)
    ]
    assert args == [
        "/home/u/bin/uv", "run", "--directory", "/home/u/my $dir%/engine",
        "qramsim", "app", "--port", "8765",
    ]  # fmt: skip
    assert "Terminal=true" in text and "Icon=/i.png" in text


def test_linux_shortcut(monkeypatch: pytest.MonkeyPatch, tmp_path: Path) -> None:
    monkeypatch.setattr(sys, "platform", "linux")
    entry, hint = make_shortcut(tmp_path, 8765)
    assert entry == tmp_path / "qram-walkers-source.desktop"
    assert f"Icon={ROOT / 'icons' / 'qram-walkers.png'}" in entry.read_text()
    assert "menu" in hint


def test_no_shortcut_on_windows(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(sys, "platform", "win32")
    assert main(["shortcut"]) == 2
    assert "qram-walkers.bat" in capsys.readouterr().err


@pytest.mark.skipif(sys.platform != "darwin", reason="macOS application")
def test_macos_app(tmp_path: Path) -> None:
    app, hint = make_shortcut(tmp_path, 8799)
    plist = plistlib.loads((app / "Contents" / "Info.plist").read_bytes())
    assert (
        plist["CFBundleIdentifier"] == BUNDLE_ID
        and plist["CFBundleName"] == "qram-walkers (source)"
    )
    assert plist.get("OSAAppletStayOpen") is True
    assert (app / "Contents" / "Resources" / "applet.icns").stat().st_size > 10_000
    assert "CFBundleIconName" not in plist  # else the Script Editor icon wins
    assert not (app / "Contents" / "Resources" / "Assets.car").exists()
    subprocess.run(["codesign", "--verify", "--deep", "--strict", str(app)], check=True)
    assert "Spotlight" in hint
    assert make_shortcut(tmp_path, 8799)[0] == app  # made again over itself
    foreign = tmp_path / "other"
    (foreign / "qram-walkers-source.app" / "Contents").mkdir(parents=True)
    with pytest.raises(ConfigError, match="not made by qramsim"):
        make_shortcut(foreign, 8799)
