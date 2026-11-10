# PyInstaller recipe of the installed app; run through build.py, which sets the environment.
# One folder (not one file): it starts faster and antivirus programs flag it less often.
import os
import sys
from pathlib import Path

from PyInstaller.utils.hooks import collect_data_files

ROOT = Path(SPECPATH).parent
VERSION = os.environ["QRAM_VERSION"]
ICON = os.environ["QRAM_ICON"]
SIGN = os.environ.get("MACOS_SIGN_IDENTITY") or None

hidden = []
datas = [(str(ROOT / "viewer" / "dist"), "viewer")]
if sys.platform in ("darwin", "win32"):
    # pywebview reads its JavaScript from files next to its modules.
    datas += collect_data_files("webview", subdir="js")
    hidden += ["webview.platforms.cocoa" if sys.platform == "darwin" else "webview.platforms.winforms"]

a = Analysis(
    [str(ROOT / "packaging" / "launcher.py")],
    pathex=[str(ROOT / "engine" / "src")],
    datas=datas,
    hiddenimports=hidden,
    # Not used by the app: plots belong to the command line, the rest to development.
    excludes=["matplotlib", "tkinter", "PIL", "pytest", "hypothesis", "IPython", "webview.platforms.qt",
              "webview.platforms.gtk", "webview.platforms.cef", "webview.platforms.android"],
    noarchive=False,
)
pyz = PYZ(a.pure)
exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name="qram-walkers",
    console=sys.platform.startswith("linux"),
    icon=ICON,
    codesign_identity=SIGN,
    entitlements_file=str(ROOT / "packaging" / "macos" / "entitlements.plist") if SIGN else None,
)
coll = COLLECT(exe, a.binaries, a.datas, name="qram-walkers")
if sys.platform == "darwin":
    app = BUNDLE(
        coll,
        name="qram-walkers.app",
        icon=ICON,
        bundle_identifier="io.github.prppgn.qram-walkers",
        version=VERSION,
        info_plist={
            "CFBundleDisplayName": "qram-walkers",
            "CFBundleShortVersionString": VERSION,
            "CFBundleVersion": VERSION,
            "NSHighResolutionCapable": True,
            # numpy's macOS wheels for this Python use the Accelerate framework of macOS 14.
            "LSMinimumSystemVersion": "14.0",
            "LSApplicationCategoryType": "public.app-category.education",
            "NSHumanReadableCopyright": "MIT License, the qram-walkers authors",
        },
    )
