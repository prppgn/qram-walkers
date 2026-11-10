# Installing qram-walkers

There are three ways to use it, from the simplest:

1. **[In the browser](#1-in-the-browser)**: nothing to install, works on any computer.
2. **[The app](#2-the-app)** for macOS, Windows or Linux: faster on large runs and noisy
   ensembles, works offline, has its own window.
3. **[From the source code](#3-from-the-source-code)**: for changing the program, or for the
   command line (videos, sweeps, scaling fits).

All three run the same simulation and show the same interface.

## 1. In the browser

Open **<https://prppgn.github.io/qram-walkers/>**.

The first visit downloads about 20 MB (Python, compiled for the browser); the browser keeps it,
so later visits start quickly. The simulation runs inside the page, on your computer: nothing is
sent anywhere. It works in recent versions of Chrome, Edge, Firefox and Safari. Large runs and
noisy ensembles take longer than in the app.

## 2. The app

Download the file for your system from the
**[latest release](https://github.com/prppgn/qram-walkers/releases/latest)**, under *Assets*.

The app is free and its source code is public, but it is not signed with a paid developer
certificate from Apple or Microsoft. So the first time you open it, your system warns you
that it cannot verify who made it. The steps below say what to click. The installers are built
by GitHub directly from the source code in this repository
([the recipe](.github/workflows/release.yml)), and each one checks itself before it is packed.

### macOS (macOS 14 Sonoma or later)

1. Download the `.dmg` for your Mac: `macos-arm64` for Apple silicon (M1, M2, M3, …),
   `macos-x64` for Intel. Not sure? Apple menu → **About This Mac**: "Chip Apple M…" means
   Apple silicon.
2. Open the `.dmg` and drag **qram-walkers** onto the **Applications** folder.
3. Open qram-walkers from Applications or Launchpad. The first time, macOS says that it could
   not verify that qram-walkers is free of malware. Click **Done** (not *Move to Trash*).
4. Open **System Settings → Privacy & Security**, scroll down to the message about
   qram-walkers, click **Open Anyway** and confirm with your password.

From then on it opens like any other app. If you are comfortable with the Terminal, this does
the same as steps 3–4:

```bash
xattr -dr com.apple.quarantine /Applications/qram-walkers.app
```

### Windows (10 or 11, 64-bit)

1. Download the `windows-x64-setup.exe`. If the browser says that the file is not commonly
   downloaded, choose to keep it (in Edge: **⋯ → Keep → Keep anyway**).
2. Open it. If a blue window says **Windows protected your PC**, click **More info**, then
   **Run anyway**.
3. Follow the installer. It needs no administrator rights: it installs for your user only and
   adds qram-walkers to the Start menu (and to the desktop, if you tick that box).

The window uses Microsoft Edge WebView2, which Windows 10 and 11 already include; if it is
missing, the app opens in your browser instead. Some antivirus programs mistrust apps packed
with PyInstaller (the tool that turns a Python program into an app) even when they are
harmless. If yours blocks qram-walkers, you can report it to them as a false positive, or use
the browser version.

### Linux (x86_64)

1. Download the `.AppImage`.
2. Make it executable: right-click it → **Properties → Permissions → Allow executing file as
   program**, or in a terminal `chmod +x qram-walkers-*.AppImage`.
3. Double-click it. qram-walkers opens in your browser, and stops by itself a few seconds
   after you close that tab.

### Using the app

It opens on the first worked example. Click **? Guide** in the top bar: the **Start** page has
a two-minute tour, and the **Controls** page describes every button. Exports (SVG, PNG, TikZ,
data) ask where to save the file.

To update, download the new version and install it over the old one. To remove it: on macOS
drag it from Applications to the Bin; on Windows, **Settings → Apps → qram-walkers →
Uninstall**; on Linux, delete the file. The app keeps its settings in
`~/Library/Application Support/qram-walkers` (macOS) or `%LOCALAPPDATA%\qram-walkers`
(Windows).

### If the app does not start

| what you see | what to do |
|---|---|
| macOS: "qram-walkers is damaged and can't be opened" | it was downloaded with a browser that marks files differently: run the `xattr` command above |
| macOS: "you can't use this version with this version of macOS" | it needs macOS 14 or later: use the browser version |
| Windows: nothing happens, or the antivirus removed the file | see the antivirus note above, or use the browser version |
| Linux: double-clicking does nothing | make it executable (step 2); or start it in a terminal to read its messages |
| the window stays blank | close it and open the app again; if it persists, start it with `--browser` (below) |

To read its messages, start it from a terminal:

* macOS: `/Applications/qram-walkers.app/Contents/MacOS/qram-walkers`
* Linux: `./qram-walkers-*.AppImage`
* Windows: the messages are in `%LOCALAPPDATA%\qram-walkers\logs\qram-walkers.log`

`--browser` opens the interface in your browser instead of a window, and `--self-test` checks
the installation without opening anything (it serves the interface and runs a worked example
exactly). Please include those messages when you report a problem
([issues](https://github.com/prppgn/qram-walkers/issues)).

## 3. From the source code

You need two tools: **uv**, which runs the Python simulation engine and fetches Python by
itself, and **Node.js with pnpm**, which build the web interface once. Everything else is
downloaded by the first run, and nothing is installed outside the project folder and the
tools' own caches.

### Install the tools

**macOS** (with [Homebrew](https://brew.sh)):

```bash
brew install uv node pnpm
```

**Linux**: uv, then Node.js 20 or newer from your distribution or
[nvm](https://github.com/nvm-sh/nvm), then pnpm:

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

```bash
npm install -g pnpm
```

**Windows** (PowerShell), then open a new terminal:

```powershell
winget install astral-sh.uv OpenJS.NodeJS.LTS
npm install -g pnpm
```

Check that all three answer:

```bash
uv --version && node --version && pnpm --version
```

You do not need to install Python: uv downloads the right version for the project.

### Get the code

```bash
git clone https://github.com/prppgn/qram-walkers.git
cd qram-walkers
```

Without git: on the repository page, choose **Code → Download ZIP**, unpack it, and open a
terminal in the unpacked folder. To update, download it again.

### Run it

**With a double click**, in the project folder:

* macOS: `qram-walkers.command`;
* Windows: `qram-walkers.bat`;
* Linux: `qram-walkers.sh` (some file managers ask whether to run it; or type `./qram-walkers.sh`
  in a terminal).

A terminal window opens with the app's messages, and your browser opens at
<http://127.0.0.1:8765/>, on the first worked example. Close that window, or press **Ctrl+C** in
it, to stop the app.

**From a terminal**, the same thing:

```bash
cd engine
uv run qramsim app
```

The first run takes a few minutes: it downloads Python and the libraries and builds the
interface. Later runs start in seconds. If the app is already running, starting it again only
opens the page.

Options: `--port 9000` if another program uses that port, `--no-browser` to open the page
yourself. The installed app's own window is also available from the source code, on macOS and
Windows: `uv run --extra desktop qramsim desktop` (after the interface has been built once).

### An icon in the Dock or in the menu (optional)

```bash
cd engine
uv run qramsim shortcut
```

* **macOS**: this makes **qram-walkers (source)** in the Applications folder of your home
  (`~/Applications/qram-walkers-source.app`), with its own icon: open it from Spotlight or
  Launchpad. It needs no terminal window: it starts the app from this folder, opens the page,
  and stays among the open applications in the Dock while you use it. Clicking its Dock icon
  opens the page again; **Quit** (in its Dock menu, or ⌘Q) stops the app. If the app was
  already running from a terminal, it opens the page and leaves that one running when you quit
  it. To keep the icon in the Dock, right-click it there and choose **Options → Keep in
  Dock**. The first start can take a few minutes, as above. Its messages go to
  `~/Library/Logs/qram-walkers-source.log`.
* **Linux**: this adds **qram-walkers (source)** to the applications menu. It runs the app in a
  terminal window, like the double-click file.
* **Windows**: right-click `qram-walkers.bat` and choose **Send to → Desktop (create shortcut)**.

The shortcut points at this folder and at the uv it finds now: if you move either, make it again
with the same command.

### Updating

```bash
git pull
```

(or download the ZIP again), then start the app as usual. The interface is rebuilt if its
sources changed.

### Optional extras

**Videos and figures from the command line** (`qramsim video`, `qramsim figure`) drive a
browser and use ffmpeg for the videos:

* macOS: they use your installed Google Chrome; add `brew install ffmpeg`;
* Linux and Windows: install ffmpeg, then, in `viewer/`, `pnpm exec playwright install chromium`.

**The browser version, built here.** `pnpm build:static` in `viewer/` writes
`viewer/dist-static/`, a set of plain files in which the same engine runs inside the browser
through [Pyodide](https://pyodide.org). Serve them with any web server (for instance
`pnpm exec vite preview --outDir dist-static`). `.github/workflows/pages.yml` publishes them on
GitHub Pages.

**The installers, built here.** `packaging/build.py` builds the installer of the system it runs
on; see the instructions at its top.

**Developing** and running the tests: see [CONTRIBUTING.md](CONTRIBUTING.md).

### If something goes wrong

| what you see | what to do |
|---|---|
| `pnpm not found`, or `node not found` | install them (see above) and open a new terminal |
| `port 8765 is busy with another program` | use another port: `uv run qramsim app --port 9000` |
| macOS: `qram-walkers.command` "cannot be opened" or "could not be verified" | this happens when the project came as a ZIP through the browser. Open **System Settings → Privacy & Security** and click **Open Anyway** next to the message; once is enough. Or start it from a terminal |
| Linux: double-clicking `qram-walkers.sh` opens it as text | run `./qram-walkers.sh` in a terminal, or make a menu entry with `uv run qramsim shortcut` |
| the Dock app says that qram-walkers stopped or could not start | click **Open the messages** (they are in `~/Library/Logs/qram-walkers-source.log`). If uv or the folder moved, make the app again with `uv run qramsim shortcut` |
| `pnpm install failed`, or a download error | check the connection and run the command again; it resumes |
| `pnpm build failed` | make sure `node --version` is 20 or newer |
| the page says it cannot reach the engine | the terminal running `qramsim app` was closed: start it again |
| the browser does not open | open <http://127.0.0.1:8765/> yourself |
| `qramsim video`: a browser error | Linux and Windows: run `pnpm exec playwright install chromium` in `viewer/`; macOS: install Google Chrome |
| `qramsim video`: `ffmpeg not found` | install ffmpeg |
| `uv run` cannot find `qramsim` | run it from the `engine/` folder |

### Removing it

Delete the folder, and the shortcut if you made one (`~/Applications/qram-walkers-source.app`
on macOS, and its icon from the Dock if you kept it there;
`~/.local/share/applications/qram-walkers-source.desktop` on Linux). `uv cache clean` frees the
libraries uv downloaded.

## Where it has been tested

* **The app.** On macOS (Apple silicon, macOS 26) by hand. On GitHub's machines, every time the
  installers are built: before it is packed, each app serves the interface and runs a worked
  example exactly (macOS on Apple silicon and Intel, Windows, Linux), the window shows the
  interface on macOS and Windows, and the Linux AppImage starts. Nobody has tried the Windows
  and Linux installers on their own computer yet: reports are welcome.
* **The browser version.** Its tests run in Chromium at every change.
* **From the source code.** On macOS by hand, with all the test suites, including the
  double-click file and the Dock app. On Linux, all the test suites run on GitHub Actions at
  every change; the menu entry has been checked by its tests only. Windows: `qram-walkers.bat`
  and the steps above have not been tried.
