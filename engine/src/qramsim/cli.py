"""Command line: ``qramsim app | run | export | video | figure | presets | serve | sweep``,
``scaling`` and ``schema``.

See DESIGN.md §3.6.
"""

from __future__ import annotations

import argparse
import csv
import json
import os
import sys
import time
from dataclasses import replace
from pathlib import Path
from typing import Any

from . import __version__
from .api import simulate
from .config import (
    VARIANTS,
    ConfigError,
    RecordOptions,
    RunConfig,
    default_copy_mode,
    input_terms,
)
from .kets import SnapshotRecorder, ket_state, paper_checkpoints
from .presets import PRESETS, get_preset
from .render import RenderOptions, render_figure, render_video
from .simulator import EngineError, InvariantViolation, Simulator
from .trajectory import Trajectory


def _parse_memory(spec: str, n: int, m: int) -> tuple[tuple[int, ...], ...] | None:
    """Explicit memory: comma-separated cells, each ``m`` bits (``"1,0,0,1"`` or ``"01,11"``)."""
    if spec in ("zeros", "ones", "random", "identity"):
        return None
    cells = [c.strip() for c in spec.split(",") if c.strip()]
    if len(cells) != 1 << n or any(len(c) != m or set(c) - {"0", "1"} for c in cells):
        raise ConfigError(
            f"--memory expects a fill name or {1 << n} comma-separated cells of {m} bits"
        )
    return tuple(tuple(int(b) for b in c) for c in cells)


def parse_noise_spec(spec: str) -> dict[str, Any]:
    """``model[:key=value…]``, lists with ``+``: ``loss:p=0.01:where=propagation+gate``."""
    model, *parts = spec.split(":")
    entry: dict[str, Any] = {"model": model}
    for part in parts:
        key, sep, value = part.partition("=")
        if not sep:
            raise ConfigError(f"noise option {part!r} is not key=value")
        if key in ("p", "p_early", "p_late", "epsilon", "eta", "sigma"):
            entry[key] = float(value)
        elif key in ("backward", "on"):
            entry[key] = value
        elif key == "vacuum_phase":
            entry[key] = value.lower() in ("1", "true", "yes", "on")
        elif key in ("where", "phases", "gates"):
            entry[key] = value.split("+")
        elif key == "targets":
            entry[key] = value.split("+") if "+" in value else value
        else:
            raise ConfigError(f"unknown noise option {key!r}")
    return entry


def _values(spec: str) -> list[float]:
    """``start:stop:step`` (inclusive) or a comma-separated list."""
    if ":" in spec:
        start, stop, step = (float(x) for x in spec.split(":"))
        count = round((stop - start) / step)
        return [round(start + i * step, 12) for i in range(count + 1)]
    return [float(x) for x in spec.split(",")]


def _config_from_args(args: argparse.Namespace) -> RunConfig:
    if args.preset:
        cfg = get_preset(args.preset).config
    elif args.config:
        cfg = RunConfig.from_dict(json.loads(Path(args.config).read_text(encoding="utf-8")))
    else:
        n, m = args.n, args.m
        if args.address:
            terms = input_terms(args.address, n)
        else:
            terms = input_terms(args.input or "uniform", n, args.seed or 0)
        memory = _parse_memory(args.memory, n, m)
        cfg = RunConfig(
            variant=args.variant,
            n=n,
            m=m,
            copy_mode=args.copy_mode or default_copy_mode(args.variant),
            terms=terms,
            memory=memory,
            memory_fill=args.memory if memory is None else "zeros",
            memory_seed=args.memory_seed if args.memory_seed is not None else (args.seed or 0),
            seed=args.seed or 0,
        )
    if getattr(args, "noise", None):
        cfg = replace(cfg, noise=tuple(parse_noise_spec(x) for x in args.noise))
    if getattr(args, "seed", None) is not None and (args.preset or args.config):
        cfg = replace(cfg, seed=args.seed)
    opts = cfg.options
    cfg = replace(
        cfg,
        options=replace(
            opts,
            include_last_backup=opts.include_last_backup and not args.no_last_backup,
            query_stagger=opts.query_stagger and not args.no_stagger,
            query=opts.query and not args.no_query,
            strict=opts.strict or args.strict,
        ),
        record=RecordOptions(
            frames=not args.no_frames,
            ghosts=not args.no_ghosts,
            frame_metrics=args.frame_metrics,
        ),
    )
    return cfg


def _print_kets(cfg: RunConfig, order: str, color: bool) -> None:
    sim = Simulator(cfg)
    snaps = SnapshotRecorder()
    sim.run([snaps])
    slots = sim.variant.slots
    width = max(len(c.name) for c in paper_checkpoints(sim, snaps))
    for cp in paper_checkpoints(sim, snaps):
        lines = ket_state(cp.branches, slots, sim.variant.family, order=order, color=color)
        print(f"{cp.name:<{width}}  [{cp.description}]")
        for line in lines:
            print(f"{'':<{width}}    {line}")


def cmd_run(args: argparse.Namespace) -> int:
    cfg = _config_from_args(args)
    color = sys.stdout.isatty() if args.color is None else args.color
    t0 = time.perf_counter()
    result = simulate(cfg)
    elapsed = time.perf_counter() - t0
    if args.print_kets:
        _print_kets(cfg, args.order, color)
        print()
    traj = result.trajectory
    if args.out:
        traj.save(args.out, indent=args.indent)
    if args.quiet:
        return 0
    meta = traj.meta
    ph = meta["phases"]
    print(
        f"qramsim {__version__} · variant {meta['variant']} ({meta['copy_mode']}) · "
        f"n = {meta['n']}, m = {meta['m']}, K = {meta['K']} slots"
    )
    print(
        f"ticks: T_fwd = {ph['T_fwd']}, T_q = {ph['T_q']}, T_total = {ph['T_total']} · "
        f"branches: {len(result.final)} · frames: {len(traj.frames)} · {elapsed:.3f} s"
    )
    for w in meta["warnings"]:
        print(f"warning: {w}")
    print("metrics: " + ", ".join(f"{k} = {v:.12g}" for k, v in result.metrics.items()))
    readout = traj.final["readout"]
    shown = readout[:16]
    print("readout (address → data, expected, probability):")
    for r in shown:
        flag = "" if r["well_formed"] else "  [malformed]"
        print(
            f"  |{r['address']}⟩ → {r['data'] or '-'} (expected {r['expected_data']}), "
            f"p = {r['prob']:.6f}{flag}"
        )
    if len(readout) > len(shown):
        print(f"  … {len(readout) - len(shown)} more branches")
    if args.out:
        print(f"trajectory written to {args.out}")
    return 0


def cmd_export(args: argparse.Namespace) -> int:
    traj = Trajectory.load(args.trajectory)
    out = Path(args.out) if args.out else None
    if args.format == "json":
        text = traj.to_json(indent=args.indent)
        if out:
            out.write_text(text, encoding="utf-8")
        else:
            print(text)
        return 0
    rows: list[dict[str, Any]] = []
    for t, e in traj.events():
        rows.append(
            {
                "t": t,
                "kind": e.get("kind", ""),
                "gate": e.get("gate", ""),
                "phase": e.get("phase", ""),
                "k": e.get("k", ""),
                "fired_in": " ".join(str(b) for b in e.get("fired_in", [])),
                "text": e.get("text", ""),
            }
        )
    fields = ["t", "kind", "gate", "phase", "k", "fired_in", "text"]
    handle = out.open("w", newline="", encoding="utf-8") if out else sys.stdout
    try:
        writer = csv.DictWriter(handle, fieldnames=fields)
        writer.writeheader()
        writer.writerows(rows)
    finally:
        if out:
            handle.close()
    return 0


def cmd_presets(args: argparse.Namespace) -> int:
    if args.json:
        print(
            json.dumps(
                [
                    {
                        "name": p.name,
                        "title": p.title,
                        "description": p.description,
                        "config": p.config.to_dict(),
                    }
                    for p in PRESETS.values()
                ],
                indent=2,
                ensure_ascii=False,
            )
        )
        return 0
    for p in PRESETS.values():
        print(f"{p.name:<14} {p.title}")
        print(f"{'':<14} {p.description}")
    return 0


def _app_answers(url: str) -> bool:
    """Whether a qram-walkers server answers at `url`."""
    import http.client
    import urllib.request

    try:
        with urllib.request.urlopen(f"{url}api/health", timeout=2) as reply:
            health = json.load(reply)
    except (OSError, ValueError, http.client.HTTPException):
        return False
    return isinstance(health, dict) and health.get("status") == "ok" and "version" in health


def cmd_app(args: argparse.Namespace) -> int:
    """The interface in one command: build it if needed, serve it, open the browser.

    If the app already runs on that port, open the page and leave it running (D36).
    """
    import socket
    import threading
    import webbrowser

    import uvicorn

    from .render import ensure_built, find_viewer
    from .server import create_app

    url = f"http://{args.host}:{args.port}/"
    with socket.socket() as probe:
        if os.name != "nt":
            # Like the server itself: a port whose last connections are still closing
            # (TIME_WAIT, for a few seconds after a stop) is free; a listening one is not.
            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        try:
            probe.bind((args.host, args.port))
        except OSError as exc:
            if not _app_answers(url):
                raise ConfigError(
                    f"port {args.port} is busy with another program; choose another one with --port"
                ) from exc
            print(f"qram-walkers is already running at {url}", flush=True)
            if not args.no_browser:
                webbrowser.open(url)
            return 0
    viewer = find_viewer()
    ensure_built(viewer)
    print(f"qram-walkers is running at {url} (Ctrl+C to stop)", flush=True)
    if not args.no_browser:
        threading.Timer(1.0, webbrowser.open, [url]).start()
    uvicorn.run(create_app(viewer / "dist"), host=args.host, port=args.port, log_level="warning")
    return 0


def cmd_desktop(args: argparse.Namespace) -> int:
    from .desktop import run

    return run(args)


def cmd_shortcut(args: argparse.Namespace) -> int:
    from .shortcut import make_shortcut

    dest = Path(args.dest).expanduser() if args.dest else None
    made, hint = make_shortcut(dest, args.port)
    print(f"made {made}\n{hint}")
    return 0


def cmd_serve(args: argparse.Namespace) -> int:
    import uvicorn

    from .server import create_app, default_static_dir

    static = Path(args.static) if args.static else default_static_dir()
    app = create_app(static)
    if static is not None and (static / "index.html").exists():
        print(f"serving the viewer from {static} at http://{args.host}:{args.port}/")
    else:
        print("API only, no built interface: `qramsim app` builds and opens it")
    uvicorn.run(app, host=args.host, port=args.port, log_level="warning" if args.quiet else "info")
    return 0


def _range(spec: str) -> range:
    lo, _, hi = spec.partition(":")
    return range(int(lo), int(hi or lo) + 1)


def cmd_scaling(args: argparse.Namespace) -> int:
    from .scaling import PAPER_DEPTH, fit, formula, measure

    samples = measure(
        args.variant,
        _range(args.n),
        _range(args.m),
        include_last_backup=not args.no_last_backup,
    )
    print(f"variant {args.variant}: T_total = 2·T_fwd + T_q measured with the engine")
    print(f"{'n':>3} {'m':>3} {'K':>4} {'T_fwd':>6} {'T_q':>4} {'T_total':>8} {'sites':>6}")
    for s in samples:
        print(
            f"{s.n:>3} {s.m:>3} {s.K:>4} {s.T_fwd:>6} {s.T_q:>4} {s.T_total:>8} {s.sites_path:>6}"
        )
    for key in ("T_fwd", "T_total", "sites_path"):
        f = fit(samples, key)
        print(
            f"fit {key:<10} = {formula(f['coefficients'])}   (max residual {f['max_residual']:.2g})"
        )
    print(f"paper: {PAPER_DEPTH.get(args.variant, '—')}")
    return 0


def cmd_sweep(args: argparse.Namespace) -> int:
    from .sweeps import plot_sweep, sweep, write_csv

    if not args.noise:
        raise ConfigError("give the swept noise channel with --noise (e.g. --noise loss)")
    configs = {}
    for variant in args.variant.split(","):
        a = argparse.Namespace(**vars(args))
        a.variant = variant
        a.copy_mode = None
        a.preset = a.config = None
        configs[variant] = _config_from_args(a)
    values = _values(args.values)
    rows = sweep(configs, args.param, values, args.runs, args.channel, args.seed, args.workers)
    head = f"{'variant':<10} {args.param:>8} {args.metric:>10} {'± sem':>8}"
    print(head)
    for r in rows:
        mean, sem = r[args.metric], r[args.metric + "_sem"]
        print(f"{r['label']:<10} {r['value']:>8g} {mean:>10.4f} {sem:>8.4f}")
    if args.csv:
        write_csv(rows, args.csv)
        print(f"table written to {args.csv}")
    if args.plot:
        noise = args.noise[args.channel]
        title = (
            f"Mean {args.metric} vs {args.param} of {noise} — n = {args.n}, m = {args.m}, "
            f"input {args.address or args.input or 'uniform'}, {args.runs} trajectories per "
            "point (error bars: standard error)"
        )
        plot_sweep(rows, args.plot, args.metric, title)
        print(f"figure written to {args.plot}")
    return 0


def cmd_schema(args: argparse.Namespace) -> int:
    from .server import dump_schemas

    print(dump_schemas())
    return 0


def _add_config_args(parser: argparse.ArgumentParser) -> None:
    """Arguments that choose a configuration: ``run``, ``video`` and ``figure`` share them."""
    src = parser.add_argument_group("configuration source")
    src.add_argument("--preset", help="named configuration (see `qramsim presets`)")
    src.add_argument("--config", help="RunConfig JSON file (qramsim.run/1)")
    arch = parser.add_argument_group("architecture")
    arch.add_argument(
        "--variant",
        default="basic",
        help="qRAM variant: " + ", ".join(VARIANTS) + " (default: basic)",
    )
    arch.add_argument("--n", type=int, default=2, help="address bits (tree depth)")
    arch.add_argument("--m", type=int, default=1, help="data bits per memory cell")
    arch.add_argument(
        "--copy-mode",
        choices=["global", "cell_switch", "backup"],
        help="query mechanism (default: global; backup for the backup variants)",
    )
    arch.add_argument(
        "--no-last-backup",
        action="store_true",
        help="backup variants: drop the backup(s) of the last data walker D_m",
    )
    inp = parser.add_argument_group("input and memory")
    inp.add_argument("--address", help="address or comma-separated addresses (equal weights)")
    inp.add_argument("--input", help="uniform | ghz | w | random | random:k (default: uniform)")
    inp.add_argument(
        "--memory",
        default="random",
        help="zeros | ones | random | identity, or explicit cells '01,11,…' (default: random)",
    )
    inp.add_argument("--memory-seed", type=int, help="seed of the random memory (default: --seed)")
    inp.add_argument(
        "--seed", type=int, help="run seed (default 0; overrides the seed of --preset/--config)"
    )
    beh = parser.add_argument_group("behaviour")
    beh.add_argument("--strict", action="store_true", help="assert the runtime invariants")
    beh.add_argument("--no-query", action="store_true", help="skip the query (time-reversal test)")
    beh.add_argument("--no-stagger", action="store_true", help="fire all copies in one tick")
    parser.add_argument(
        "--noise",
        action="append",
        metavar="MODEL[:k=v…]",
        help="noise channel, repeatable: loss:p=0.01:where=propagation+gate:targets=data",
    )


def _add_render_args(parser: argparse.ArgumentParser) -> None:
    _add_config_args(parser)
    look = parser.add_argument_group("drawing")
    look.add_argument("--out", required=True, help="output file (format from the extension)")
    look.add_argument("--theme", default="paper", choices=["paper", "talk"])
    look.add_argument(
        "--figure-mode", action="store_true", help="(d,l) labels, kets near the train"
    )
    look.add_argument("--orientation", default="horizontal", choices=["horizontal", "vertical"])
    parser.set_defaults(no_frames=False, no_ghosts=False, frame_metrics=False)


def _render_options(args: argparse.Namespace, width: int, height: int) -> RenderOptions:
    return RenderOptions(args.theme, width, height, args.figure_mode, args.orientation)


def _size(spec: str) -> tuple[int, int]:
    try:
        width, height = (int(x) for x in spec.lower().split("x"))
    except ValueError as exc:
        raise ConfigError(f"--size expects WIDTHxHEIGHT, got {spec!r}") from exc
    return width, height


def cmd_video(args: argparse.Namespace) -> int:
    traj = simulate(_config_from_args(args)).trajectory
    width, height = _size(args.size)
    out = Path(args.out)
    render_video(
        traj, out, _render_options(args, width, height), args.duration, args.fps, args.hold
    )
    print(f"wrote {out}")
    return 0


def cmd_figure(args: argparse.Namespace) -> int:
    traj = simulate(_config_from_args(args)).trajectory
    out = Path(args.out)
    render_figure(traj, out, _render_options(args, 1600, 1000), args.tick, args.scale)
    print(f"wrote {out}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(
        prog="qramsim",
        description="Simulator of the quantum-walker quantum RAM (arXiv:2508.02855).",
    )
    parser.add_argument("--version", action="version", version=f"qramsim {__version__}")
    sub = parser.add_subparsers(dest="command", required=True)

    run = sub.add_parser("run", help="simulate one configuration")
    _add_config_args(run)
    out = run.add_argument_group("output")
    out.add_argument("--out", help="write the trajectory JSON here")
    out.add_argument("--indent", type=int, help="pretty-print the JSON")
    out.add_argument("--no-frames", action="store_true", help="record only the final state")
    out.add_argument("--no-ghosts", action="store_true", help="omit ghost data of empty slots")
    out.add_argument("--frame-metrics", action="store_true", help="entropy per frame")
    out.add_argument("--print-kets", action="store_true", help="print the paper's ket sequence")
    out.add_argument(
        "--order", default="paper", choices=["paper", "train"], help="ket order (tail→front)"
    )
    col = out.add_mutually_exclusive_group()
    col.add_argument("--color", dest="color", action="store_true", default=None)
    col.add_argument("--no-color", dest="color", action="store_false")
    out.add_argument("--quiet", action="store_true", help="print nothing but the kets")
    run.set_defaults(func=cmd_run)

    swp = sub.add_parser("sweep", help="fidelity (or another metric) along a noise parameter")
    swp.add_argument("--variant", default="basic", help="comma-separated variants: basic,backup")
    swp.add_argument("--n", type=int, default=3)
    swp.add_argument("--m", type=int, default=2)
    swp.add_argument("--address", help="address(es) instead of --input")
    swp.add_argument("--input", default="uniform", help="uniform | ghz | w | random[:k]")
    swp.add_argument("--memory", default="random", help="memory fill or explicit cells")
    swp.add_argument("--memory-seed", type=int, default=1)
    swp.add_argument("--noise", action="append", required=True, metavar="MODEL[:k=v…]")
    swp.add_argument("--channel", type=int, default=0, help="index of the swept --noise entry")
    swp.add_argument("--param", default="p", help="swept parameter of that channel")
    swp.add_argument("--values", default="0:0.1:0.01", help="start:stop:step or a,b,c")
    swp.add_argument("--runs", type=int, default=200, help="trajectories per point")
    swp.add_argument("--seed", type=int, default=0, help="seed of the first trajectory")
    swp.add_argument("--workers", type=int, help="parallel processes (default: CPU count, max 8)")
    swp.add_argument(
        "--metric",
        default="fidelity",
        choices=[
            "fidelity",
            "heralded_fidelity",
            "success",
            "consistency",
            "entropy_AD",
            "collided",
            "discarded",
        ],
    )
    swp.add_argument("--csv", help="write the table here")
    swp.add_argument("--plot", help="write the figure here (PNG, SVG, PDF)")
    swp.set_defaults(
        func=cmd_sweep,
        no_query=False,
        no_stagger=False,
        strict=False,
        no_frames=True,
        no_ghosts=False,
        frame_metrics=False,
        no_last_backup=False,
        copy_mode=None,
        preset=None,
        config=None,
    )

    exp = sub.add_parser("export", help="re-export a trajectory")
    exp.add_argument("trajectory", help="trajectory JSON file")
    exp.add_argument("--format", default="json", choices=["json", "csv-events"])
    exp.add_argument("--out", help="output file (default: stdout)")
    exp.add_argument("--indent", type=int, help="pretty-print the JSON")
    exp.set_defaults(func=cmd_export)

    vid = sub.add_parser("video", help="render a run as MP4 or GIF (Playwright and ffmpeg)")
    _add_render_args(vid)
    vid.add_argument("--duration", type=float, default=20.0, help="seconds (default 20)")
    vid.add_argument("--fps", type=int, default=30, help="frames per second (default 30)")
    vid.add_argument("--hold", type=float, default=1.0, help="seconds on the first and last frame")
    vid.add_argument("--size", default="1920x1080", help="WIDTHxHEIGHT (default 1920x1080)")
    vid.set_defaults(func=cmd_video)

    fig = sub.add_parser("figure", help="render one frame as SVG, PNG or TikZ")
    _add_render_args(fig)
    fig.add_argument("--tick", type=int, help="tick to draw, −1 = input (default: the last)")
    fig.add_argument("--scale", type=float, default=3.0, help="PNG scale factor (default 3)")
    fig.set_defaults(func=cmd_figure)

    pre = sub.add_parser("presets", help="list the named configurations")
    pre.add_argument("--json", action="store_true", help="print the configurations as JSON")
    pre.set_defaults(func=cmd_presets)

    app = sub.add_parser(
        "app", help="the interface: build it if needed, serve it, open the browser"
    )
    app.add_argument("--host", default="127.0.0.1")
    app.add_argument("--port", type=int, default=8765)
    app.add_argument("--no-browser", action="store_true", help="do not open the browser")
    app.set_defaults(func=cmd_app)

    dsk = sub.add_parser(
        "desktop",
        help="what the installed app runs: the interface in a window of its own "
        "(needs the desktop extra), or in the browser with --browser",
    )
    from .desktop import add_arguments as desktop_arguments

    desktop_arguments(dsk)
    dsk.set_defaults(func=cmd_desktop)

    sct = sub.add_parser(
        "shortcut", help="an application (macOS) or a menu entry (Linux) that starts the app"
    )
    sct.add_argument("--port", type=int, default=8765)
    sct.add_argument(
        "--dest",
        help="folder for it (default: ~/Applications on macOS, "
        "~/.local/share/applications on Linux)",
    )
    sct.set_defaults(func=cmd_shortcut)

    srv = sub.add_parser("serve", help="HTTP API for the viewer (and the built viewer, if any)")
    srv.add_argument("--host", default="127.0.0.1")
    srv.add_argument("--port", type=int, default=8765)
    srv.add_argument("--static", help="directory of a built viewer (default: viewer/dist)")
    srv.add_argument("--quiet", action="store_true", help="log warnings only")
    srv.set_defaults(func=cmd_serve)

    scl = sub.add_parser("scaling", help="measure tick counts on a grid of sizes and fit them")
    scl.add_argument("--variant", default="basic")
    scl.add_argument("--n", default="2:8", help="range lo:hi of address bits (default 2:8)")
    scl.add_argument("--m", default="1:4", help="range lo:hi of data bits (default 1:4)")
    scl.add_argument("--no-last-backup", action="store_true", help="backup without D̃_m")
    scl.set_defaults(func=cmd_scaling)

    sch = sub.add_parser("schema", help="print the JSON schemas of the run and trajectory formats")
    sch.set_defaults(func=cmd_schema)
    return parser


def main(argv: list[str] | None = None) -> int:
    parser = build_parser()
    args = parser.parse_args(argv)
    try:
        code: int = args.func(args)
    except (ConfigError, KeyError, EngineError, InvariantViolation, ValueError) as exc:
        print(f"qramsim: error: {exc}", file=sys.stderr)
        return 2
    return code
