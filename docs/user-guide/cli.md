# Command line {#cli}

Everything the interface does, and more, is available from a terminal, in the `engine/` folder.
`uv run qramsim <command> --help` lists every option of a command.

| command | what it does |
|---|---|
| `app` | [the interface](#cli-app): builds it if needed, serves it and opens the browser |
| `shortcut` | [an icon](#cli-shortcut) that starts the interface: in the Dock (macOS) or the menu (Linux) |
| `desktop` | [what the installed app runs](#cli-desktop): the interface in a window of its own |
| `run` | [one simulation](#cli-run): prints the results, can write the trajectory |
| `figure` | [one frame](#cli-figure) as SVG, PNG or TikZ |
| `video` | [a whole run](#cli-figure) as MP4 or GIF |
| `sweep` | [a metric along a noise parameter](#cli-sweep), for several variants |
| `scaling` | [measures the depth](#cli-scaling) on a grid of sizes and fits it |
| `presets` | lists the named configurations |
| `export` | re-exports a trajectory file as JSON or as a CSV of its events |
| `serve` | the HTTP API alone, for development |
| `schema` | prints the JSON schemas of the configuration and trajectory formats |

## The interface {#cli-app}

```bash
uv run qramsim app
```

`--port` chooses the port (default 8765), `--no-browser` does not open the browser. If the app
already runs on that port, the command opens the page and leaves it running. The files
`qram-walkers.command` (macOS), `qram-walkers.bat` (Windows) and `qram-walkers.sh` (Linux) in the
project folder run this command with a double click.

## An icon in the Dock or the menu {#cli-shortcut}

```bash
uv run qramsim shortcut
```

On macOS it makes `~/Applications/qram-walkers-source.app`, named **qram-walkers (source)**:
opening it starts the interface from this folder without a terminal window and opens the page;
it stays open, in the Dock, while you use it, and quitting it stops the interface it started.
Its messages go to `~/Library/Logs/qram-walkers-source.log`. On Linux it adds an entry to the
applications menu that runs the interface in a terminal window. The shortcut points at this
folder and at the uv found now: make it again after moving either. `--port` bakes another port
in, `--dest` puts the shortcut in another folder. (The installed app, from the releases, is a
separate program named **qram-walkers**.)

## The installed app {#cli-desktop}

```bash
uv run --extra desktop qramsim desktop
uv run qramsim desktop --browser
uv run qramsim desktop --self-test
```

What the installers run: the built interface on a free local port, in a window of its own on
macOS and Windows (the `desktop` extra installs [pywebview](https://pywebview.flowrl.com)), where
exports open a save dialog. On Linux, or with `--browser`, it opens the default browser instead
and stops by itself a few seconds after its page is closed. `--self-test` serves the interface
and runs E2, checking that the fidelity is exactly 1, without opening anything;
`--self-test window` also opens a hidden window and waits for the interface to appear. The
installed app takes the same options.

## One simulation {#cli-run}

```bash
uv run qramsim run --preset E1 --print-kets
uv run qramsim run --variant dualrail_backup --n 3 --m 2 --address 101,010 --out trajectory.json
uv run qramsim run --preset E2 --noise loss:p=0.02 --seed 3
```

Choose the configuration with `--preset` or `--config file.json`, or build it with:

| option | meaning |
|---|---|
| `--variant` | `basic`, `backup`, `qudit_short`, `qudit_long`, `dualrail_basic`, `dualrail_backup` |
| `--n`, `--m` | address bits, data bits per cell |
| `--copy-mode` | `global`, `cell_switch`, `backup` |
| `--no-last-backup` | backup variants: drops the backup(s) of the last data walker |
| `--address` | one address, or several separated by commas, with equal weights |
| `--input` | `uniform`, `ghz`, `w`, `random`, `random:k` |
| `--memory` | `zeros`, `ones`, `random`, `identity`, or the cells written out: `01,11,00,10` |
| `--memory-seed`, `--seed` | seeds of the random memory and of the run |
| `--noise` | one channel, repeatable: `model:key=value:…`, with lists joined by `+`, for instance `loss:p=0.01:where=propagation+gate:targets=data` |
| `--strict` | checks the invariants at every tick |
| `--no-query`, `--no-stagger` | skips the query; fires all the copies in one tick |

and read the results with `--print-kets` (the paper's sequence of kets; `--order`, `--color`,
`--no-color`), `--out` and `--indent` (the trajectory as JSON), `--no-frames`, `--no-ghosts`,
`--frame-metrics` (what the trajectory records), `--quiet`.

## Figures and videos {#cli-figure}

```bash
uv run qramsim figure --preset E2 --tick 5 --figure-mode --out fig.svg
uv run qramsim video --preset E2 --theme talk --duration 20 --out e2.mp4
```

They take the same configuration options as `run`, and `--out` (the format follows the extension:
`.svg`, `.png`, `.tex`; `.mp4`, `.gif`), `--theme`, `--figure-mode`, `--orientation`. `figure` adds
`--tick` (−1 is the input state; default: the last) and `--scale`; `video` adds `--duration`, `--fps`,
`--hold` (seconds on the first and last frame) and `--size`. See
[the installation guide](https://github.com/prppgn/qram-walkers/blob/main/INSTALL.md) for what they need.

## Sweeps {#cli-sweep}

```bash
uv run qramsim sweep --variant basic,qudit_short,dualrail_basic --n 3 --m 2 \
    --noise loss:where=propagation --param p --values 0:0.02:0.002 --runs 200 \
    --metric heralded_fidelity --plot heralded.png --csv heralded.csv
```

Runs an [ensemble](noise.md#noise-ensembles) at each value of `--param` of the noise channel number
`--channel`, for each variant, and prints, plots and saves the mean of `--metric` with its standard
error. `--values` is `start:stop:step` or a list; `--workers` sets the parallel processes.

## Depth {#cli-scaling}

```bash
uv run qramsim scaling --variant qudit_short --n 2:7 --m 1:4
```

Runs each size, prints the tick counts, fits them with a polynomial in $n$ and $m$ and recalls the
paper's formula. See [why the constants differ](faq.md#faq-depth).

## From Python {#cli-python}

```python
from qramsim import InputTerm, RunConfig, simulate

config = RunConfig(
    variant="dualrail_basic", n=2, m=1,
    terms=(InputTerm("00", 1), InputTerm("11", 1)),
    memory=((1,), (0,), (0,), (0,)),
)
result = simulate(config)
print(result.metrics)
result.trajectory.save("e2.json")
```
