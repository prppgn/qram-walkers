"""Shortcuts that start the app from this source checkout (D36): an application on macOS, a
menu entry on Linux, named "qram-walkers (source)" so as not to be confused with the installed
app (D37), which has its own name and bundle identifier.

Both point at this source checkout and at the `uv` found now, so they are made on the machine
that runs them (`qramsim shortcut`), not shipped. Run the command again after moving the folder.
"""

from __future__ import annotations

import os
import plistlib
import re
import shlex
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

from .config import ConfigError
from .render import find_viewer

APP_NAME = "qram-walkers (source)"
FILE_NAME = "qram-walkers-source"
BUNDLE_ID = "io.github.prppgn.qram-walkers.source"
ICON = Path("icons") / "qram-walkers.png"
# Sizes of a macOS iconset: (name, pixels).
ICONSET = [
    (f"icon_{s}x{s}{suffix}.png", s * k)
    for s in (16, 32, 128, 256, 512)
    for suffix, k in (("", 1), ("@2x", 2))
]


def repo_root() -> Path:
    """The source checkout: the folder that holds `engine/` and `viewer/`."""
    return find_viewer().parent


def _uv() -> str:
    uv = shutil.which("uv")
    if uv is None:
        raise ConfigError("uv was not found on PATH; see INSTALL.md")
    return str(Path(uv).resolve())


def _as_string(text: str) -> str:
    """An AppleScript string literal."""
    return '"' + text.replace("\\", "\\\\").replace('"', '\\"') + '"'


def applescript(engine: Path, uv: str, search_path: str, port: int, log: Path) -> str:
    """Source of the stay-open applet.

    It stays open while the app is used, so that it shows among the running applications in the
    Dock. It opens the page once the server answers, and starts the server unless one already
    answers (from a terminal, say), or when that one stops. On Quit it stops only a server it
    started itself.
    """
    url = f"http://127.0.0.1:{port}/"
    start = (
        f"PATH={shlex.quote(search_path)} nohup {shlex.quote(uv)} run"
        f" --directory {shlex.quote(str(engine))} qramsim app --no-browser --port {port}"
        f" > {shlex.quote(str(log))} 2>&1 & echo $!"
    )
    health = f'curl -sf --max-time 2 {url}api/health | grep -q \'"status":"ok"\''
    page = _as_string(url)
    stopped = _as_string(f"qram-walkers stopped or could not start. Its messages are in {log}.")
    show_log = _as_string(f"open -a Console {shlex.quote(str(log))}")
    return f"""-- Made by `qramsim shortcut`: make it again rather than edit it.
global serverPID, pageOpened

on run
	set serverPID to ""
	set pageOpened to false
	if not appIsUp() then startServer()
end run

on idle
	if appIsUp() then
		if not pageOpened then
			open location {page}
			set pageOpened to true
		end if
		return 5
	end if
	if serverPID is "" then
		startServer()
		return 1
	end if
	if serverIsAlive() then return 1
	set serverPID to ""
	set choices to {{"Open the messages", "Close"}}
	set answer to display dialog {stopped} buttons choices default button 2 with icon caution
	if button returned of answer is "Open the messages" then do shell script {show_log}
	quit
	return 1
end idle

on startServer()
	set serverPID to do shell script {_as_string(start)}
	display notification "The first time can take a few minutes." with title "Starting qram-walkers"
end startServer

on reopen
	if appIsUp() then open location {page}
end reopen

on quit
	if serverPID is not "" then
		try
			do shell script "kill " & serverPID
		end try
	end if
	continue quit
end quit

on appIsUp()
	try
		do shell script {_as_string(health)}
		return true
	on error
		return false
	end try
end appIsUp

on serverIsAlive()
	try
		do shell script "kill -0 " & serverPID
		return true
	on error
		return false
	end try
end serverIsAlive
"""


def _run(*cmd: str) -> None:
    done = subprocess.run(cmd, capture_output=True, text=True)
    if done.returncode != 0:
        raise ConfigError(f"{cmd[0]} failed: {done.stderr.strip() or done.stdout.strip()}")


def _icns(png: Path, out: Path, work: Path) -> None:
    iconset = work / "icon.iconset"
    iconset.mkdir()
    for name, px in ICONSET:
        _run("sips", "-z", str(px), str(px), str(png), "--out", str(iconset / name))
    _run("iconutil", "-c", "icns", str(iconset), "-o", str(out))


def _ours(app: Path) -> bool:
    try:
        with (app / "Contents" / "Info.plist").open("rb") as f:
            return bool(plistlib.load(f).get("CFBundleIdentifier") == BUNDLE_ID)
    except (OSError, plistlib.InvalidFileException):
        return False


def make_macos_app(dest: Path, port: int = 8765) -> Path:
    """`<dest>/qram-walkers-source.app`: opens the page, starts the server if needed, stops it
    on quit."""
    root = repo_root()
    app = dest / f"{FILE_NAME}.app"
    if app.exists():
        if not _ours(app):
            raise ConfigError(f"{app} exists and was not made by qramsim; move it away first")
        shutil.rmtree(app)
    dest.mkdir(parents=True, exist_ok=True)
    log = Path.home() / "Library" / "Logs" / f"{FILE_NAME}.log"
    source = applescript(root / "engine", _uv(), os.environ.get("PATH", ""), port, log)
    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp)
        (work / "main.applescript").write_text(source, encoding="utf-8")
        _run("osacompile", "-s", "-o", str(app), str(work / "main.applescript"))
        _icns(root / ICON, app / "Contents" / "Resources" / "applet.icns", work)
    # osacompile also ships the Script Editor icon in an asset catalog, which macOS prefers
    # to the .icns file: without it, applet.icns is the icon.
    (app / "Contents" / "Resources" / "Assets.car").unlink(missing_ok=True)
    info = app / "Contents" / "Info.plist"
    with info.open("rb") as f:
        plist = plistlib.load(f)
    plist.pop("CFBundleIconName", None)
    plist.update(CFBundleIdentifier=BUNDLE_ID, CFBundleName=APP_NAME, CFBundleDisplayName=APP_NAME)
    with info.open("wb") as f:
        plistlib.dump(plist, f)
    _run("codesign", "--force", "--deep", "--sign", "-", str(app))
    return app


def _exec_arg(text: str) -> str:
    """One quoted argument of a desktop entry's Exec key (Desktop Entry Specification)."""
    quoted = '"' + re.sub(r'(["`$\\])', r"\\\1", text) + '"'
    return quoted.replace("\\", "\\\\").replace("%", "%%")


def desktop_entry(engine: Path, uv: str, icon: Path, port: int) -> str:
    """A Linux menu entry that runs the app in a terminal window, like the double-click file."""
    args = [_exec_arg(uv), "run", "--directory", _exec_arg(str(engine)), "qramsim", "app"]
    command = " ".join([*args, "--port", str(port)])
    return (
        "[Desktop Entry]\n"
        "Type=Application\n"
        f"Name={APP_NAME}\n"
        "Comment=Simulator of the quantum-walker quantum RAM; close the terminal to stop it\n"
        f"Exec={command}\n"
        f"Icon={icon}\n"
        "Terminal=true\n"
        "Categories=Education;Science;Physics;\n"
    )


def make_linux_entry(dest: Path, port: int = 8765) -> Path:
    root = repo_root()
    dest.mkdir(parents=True, exist_ok=True)
    entry = dest / f"{FILE_NAME}.desktop"
    entry.write_text(desktop_entry(root / "engine", _uv(), root / ICON, port), encoding="utf-8")
    entry.chmod(0o755)
    return entry


def make_shortcut(dest: Path | None, port: int) -> tuple[Path, str]:
    """The shortcut for this system, and what to tell the user about it."""
    if sys.platform == "darwin":
        app = make_macos_app(dest or Path.home() / "Applications", port)
        return app, (
            "Open it from Spotlight or Launchpad; while it is open it is in the Dock, and "
            "quitting it stops the app (right-click its Dock icon, Options, Keep in Dock, to "
            "keep it there)."
        )
    if sys.platform.startswith("linux"):
        entry = make_linux_entry(dest or Path.home() / ".local" / "share" / "applications", port)
        return entry, (
            "It is in the applications menu; it runs the app in a terminal window, and closing "
            "that window stops it."
        )
    raise ConfigError(
        "shortcuts are made on macOS and Linux; on Windows, double-click qram-walkers.bat in "
        "the project folder (right-click it, Send to, Desktop, for a shortcut on the desktop)"
    )
