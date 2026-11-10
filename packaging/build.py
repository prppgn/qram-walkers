"""Build the installer of this system: a .dmg (macOS), a setup .exe (Windows), an .AppImage (Linux).

From engine/, after building the interface (pnpm build in viewer/):

    uv run --extra desktop --group bundle python ../packaging/build.py

Windows also needs Inno Setup (iscc on PATH, or its path in ISCC); Linux needs appimagetool
(on PATH, or its path in APPIMAGETOOL). The result is in packaging/out/. Before packing, the
bundled app checks itself (--self-test): it serves the interface and runs E2 exactly.

macOS: with MACOS_SIGN_IDENTITY set (a Developer ID Application certificate in the keychain)
the app is signed with it; otherwise it is signed ad hoc, which is what macOS needs to run it
here but not to open it without a warning elsewhere (see INSTALL.md).
"""

from __future__ import annotations

import os
import platform
import shutil
import subprocess
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parent
OUT = HERE / "out"
WORK = HERE / "build"
NAME = "qram-walkers"


def run(*cmd: str | Path, **kwargs: object) -> None:
    print("+", " ".join(str(c) for c in cmd), flush=True)
    subprocess.run([str(c) for c in cmd], check=True, **kwargs)  # type: ignore[call-overload]


def tool(name: str, env: str) -> str:
    found = os.environ.get(env) or shutil.which(name)
    if not found:
        sys.exit(f"{name} not found: put it on PATH or set {env}")
    return found


def arch() -> str:
    machine = platform.machine().lower()
    return {"amd64": "x64", "x86_64": "x64", "aarch64": "arm64"}.get(machine, machine)


def pyinstaller(version: str) -> Path:
    if not (ROOT / "viewer" / "dist" / "index.html").is_file():
        sys.exit("build the interface first: pnpm build in viewer/")
    env = {**os.environ, "QRAM_VERSION": version, "QRAM_ICON": str(ROOT / "icons" / f"{NAME}.png")}
    dist = WORK / "dist"
    run(
        sys.executable, "-m", "PyInstaller", "--noconfirm", "--clean",
        "--distpath", dist, "--workpath", WORK / "pyinstaller", HERE / f"{NAME}.spec",
        env=env,
    )  # fmt: skip
    return dist


def self_test(executable: Path) -> None:
    run(executable, "--self-test")


def macos(dist: Path, version: str) -> Path:
    app = dist / f"{NAME}.app"
    self_test(app / "Contents" / "MacOS" / NAME)
    stage = WORK / "dmg"
    shutil.rmtree(stage, ignore_errors=True)
    stage.mkdir(parents=True)
    run("ditto", app, stage / app.name)
    (stage / "Applications").symlink_to("/Applications")
    dmg = OUT / f"{NAME}-{version}-macos-{arch()}.dmg"
    dmg.unlink(missing_ok=True)
    run(
        "hdiutil", "create", "-volname", f"{NAME} {version}", "-srcfolder", stage,
        "-fs", "HFS+", "-format", "UDZO", "-ov", dmg,
    )  # fmt: skip
    return dmg


def windows(dist: Path, version: str) -> Path:
    folder = dist / NAME
    exe = folder / f"{NAME}.exe"
    # A windowed program: wait for it explicitly to read its exit status.
    run(
        "powershell", "-NoProfile", "-Command",
        f"$p = Start-Process -FilePath '{exe}' -ArgumentList '--self-test' -Wait -PassThru;"
        " exit $p.ExitCode",
    )  # fmt: skip
    from PIL import Image

    icon = WORK / f"{NAME}.ico"
    Image.open(ROOT / "icons" / f"{NAME}.png").save(icon, sizes=[(s, s) for s in (16, 32, 48, 256)])
    name = f"{NAME}-{version}-windows-{arch()}-setup"
    run(
        tool("iscc", "ISCC"), f"/DAppVersion={version}", f"/DSourceDir={folder}",
        f"/DOutputDir={OUT}", f"/DOutputName={name}", f"/DIconFile={icon}",
        HERE / "windows" / f"{NAME}.iss",
    )  # fmt: skip
    return OUT / f"{name}.exe"


DESKTOP_ENTRY = f"""[Desktop Entry]
Type=Application
Name={NAME}
Comment=Simulator of the quantum-walker quantum RAM
Exec={NAME}
Icon={NAME}
Terminal=false
Categories=Education;Science;Physics;
"""

APPRUN = f"""#!/bin/sh
# Start the bundled app; it opens the default browser and stops once its page is closed.
HERE="$(dirname "$(readlink -f "$0")")"
exec "$HERE/usr/lib/{NAME}/{NAME}" "$@"
"""


def linux(dist: Path, version: str) -> Path:
    self_test(dist / NAME / NAME)
    appdir = WORK / f"{NAME}.AppDir"
    shutil.rmtree(appdir, ignore_errors=True)
    (appdir / "usr" / "lib").mkdir(parents=True)
    shutil.copytree(dist / NAME, appdir / "usr" / "lib" / NAME, symlinks=True)
    (appdir / "AppRun").write_text(APPRUN, encoding="utf-8")
    (appdir / "AppRun").chmod(0o755)
    (appdir / f"{NAME}.desktop").write_text(DESKTOP_ENTRY, encoding="utf-8")
    shutil.copy(ROOT / "icons" / f"{NAME}.png", appdir / f"{NAME}.png")
    image = OUT / f"{NAME}-{version}-linux-{platform.machine()}.AppImage"
    image.unlink(missing_ok=True)
    env = {**os.environ, "ARCH": platform.machine()}
    run(tool("appimagetool", "APPIMAGETOOL"), "--no-appstream", appdir, image, env=env)
    return image


def main() -> None:
    sys.path.insert(0, str(ROOT / "engine" / "src"))
    from qramsim import __version__ as version

    OUT.mkdir(parents=True, exist_ok=True)
    dist = pyinstaller(version)
    if sys.platform == "darwin":
        made = macos(dist, version)
    elif sys.platform == "win32":
        made = windows(dist, version)
    else:
        made = linux(dist, version)
    print(f"made {made} ({made.stat().st_size / 1e6:.0f} MB)", flush=True)


if __name__ == "__main__":
    main()
