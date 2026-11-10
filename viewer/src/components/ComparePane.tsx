// Comparison of two variants on one clock (DESIGN.md §7.5, D10): the current run beside
// the same input and memory on another variant, tick for tick, so that the different
// depths show. It keeps its own clock and does not touch the main playback.
import { useEffect, useMemo, useRef, useState } from "react";
import { engine } from "../engine/client";
import { captionAt, instantAt } from "../export/video";
import type { Trajectory } from "../model/types";
import { usePlayback, type ViewOptions } from "../playback/store";
import { comparisonConfig, defaultPartner, noiseDropped } from "./compareModel";
import { InfoButton } from "./Panel";
import { VARIANTS } from "./setup/configModel";
import { layoutFor, TreeScene } from "./TreeCanvas";

function variantLabel(id: string): string {
  return VARIANTS.find((v) => v.id === id)?.label ?? id;
}

function Side({ traj, pos, view, testId }: { traj: Trajectory; pos: number; view: ViewOptions; testId: string }) {
  const layout = useMemo(
    () => layoutFor(traj, view),
    // only these options change the layout
    [traj, view.mirror, view.spacing, view.orientation],
  );
  const last = traj.frames.length - 1;
  const { frame, progress } = instantAt(pos, last);
  const fidelity = traj.final.metrics.fidelity;
  const done = pos >= last;
  return (
    <section className="compare-side" data-testid={testId}>
      <div className="compare-title">
        <strong>{variantLabel(traj.meta.variant)}</strong>
        <span className="muted" title="Slots of the train, ticks of the whole run, fidelity with Eq. (1)">
          K = {traj.meta.K} · T_total = {traj.meta.phases.T_total} · F = {fidelity === undefined ? "—" : fidelity.toFixed(4)}
        </span>
        <span className="badge" data-testid={`${testId}-state`} title="This run ends at tick T_total − 1 of the shared clock">
          {done ? `finished at tick ${traj.meta.phases.T_total - 1}` : traj.frames[frame]!.phase === "init" ? "input" : traj.frames[frame]!.phase}
        </span>
      </div>
      <div className={`canvas${view.figure ? " figure" : ""}`}>
        <svg viewBox={`0 0 ${layout.width} ${layout.height}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%" role="img" aria-label={`${traj.meta.variant} variant`}>
          <TreeScene traj={traj} layout={layout} frame={frame} progress={progress} view={view} highlight={null} />
        </svg>
      </div>
      <p className="compare-caption">{captionAt(traj, frame)}</p>
    </section>
  );
}

export function ComparePane() {
  const traj = usePlayback((s) => s.traj);
  const view = usePlayback((s) => s.view);
  const close = usePlayback((s) => s.setCompareOpen);
  const [variant, setVariant] = useState(() => defaultPartner(traj?.meta.variant ?? "basic"));
  const [other, setOther] = useState<Trajectory | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(4);
  const lastTime = useRef(0);

  useEffect(() => {
    if (!traj) return;
    let live = true;
    setBusy(true);
    setError(null);
    setOther(null);
    setPos(0);
    setPlaying(false);
    engine
      .simulate(comparisonConfig(traj, variant))
      .then((t) => {
        if (live) setOther(t);
      })
      .catch((e: unknown) => {
        if (live) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (live) setBusy(false);
      });
    return () => {
      live = false;
    };
  }, [traj, variant]);

  const end = Math.max(traj?.frames.length ?? 1, other?.frames.length ?? 1) - 1;

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    lastTime.current = performance.now();
    const loop = (now: number) => {
      const dt = (now - lastTime.current) / 1000;
      lastTime.current = now;
      setPos((p) => {
        const next = Math.min(end, p + dt * speed);
        if (next >= end) setPlaying(false);
        return next;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, end]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  if (!traj) return null;
  const tick = Math.ceil(pos) - 1;
  return (
    <div className="compare-pane" data-testid="compare-pane" role="dialog" aria-label="Comparison of two variants">
      <header className="compare-head">
        <strong>Compare</strong>
        <InfoButton anchor="ui-compare" topic="the comparison of two variants" />
        <span className="muted">same input and memory, one clock</span>
        <label className="field" title="The variant to compare with the current run">
          with
          <select value={variant} data-testid="compare-variant" onChange={(e) => setVariant(e.target.value)}>
            {VARIANTS.filter((v) => v.id !== traj.meta.variant).map((v) => (
              <option key={v.id} value={v.id} title={v.tip}>
                {v.label}
              </option>
            ))}
          </select>
        </label>
        {noiseDropped(traj, variant) && (
          <span className="muted" title="The logical flip exists only on the qudit and dual-rail variants, where the logical value is not the presence of a walker">
            (a noise channel of this run does not exist on this variant and was dropped)
          </span>
        )}
        {busy && <span className="muted">running the engine…</span>}
        {error && (
          <span className="export-error" role="alert" data-testid="compare-error">
            {error}
          </span>
        )}
        <span className="spacer" />
        <button className="btn" title="Back to the main view (Esc)" data-testid="compare-close" onClick={() => close(false)}>
          Close
        </button>
      </header>
      <div className="compare-sides">
        <Side traj={traj} pos={pos} view={view} testId="compare-a" />
        {other && <Side traj={other} pos={pos} view={view} testId="compare-b" />}
      </div>
      <footer className="compare-clock">
        <button className="btn icon" title="Back to the input state" aria-label="Go to start" onClick={() => setPos(0)}>
          ⏮
        </button>
        <button
          className="btn icon primary"
          title="Play / pause the shared clock"
          aria-label={playing ? "Pause" : "Play"}
          data-testid="compare-play"
          disabled={!other}
          onClick={() => {
            if (!playing && pos >= end) setPos(0);
            setPlaying(!playing);
          }}
        >
          {playing ? "⏸" : "▶"}
        </button>
        <input
          className="compare-slider"
          type="range"
          min={0}
          max={end}
          step={1}
          value={Math.round(pos)}
          data-testid="compare-slider"
          title="Shared clock: drag to any tick"
          aria-label="Shared clock"
          onChange={(e) => {
            setPlaying(false);
            setPos(Number(e.target.value));
          }}
        />
        <span className="mono" data-testid="compare-tick" title="Tick of the shared clock">
          {tick < 0 ? "input" : `tick ${tick}`} / {end - 1}
        </span>
        <label className="field" title="Playback speed in clock ticks per second">
          speed
          <input type="range" min={0} max={5} step={0.5} value={Math.log2(speed)} onChange={(e) => setSpeed(2 ** Number(e.target.value))} />
          <span className="mono">{speed.toFixed(1)}/s</span>
        </label>
      </footer>
    </div>
  );
}
