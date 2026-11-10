// Playback controls (D6) and the timeline with phase bands and event ticks.
import { useMemo, useRef } from "react";
import { phaseBands } from "../playback/steps";
import { usePlayback } from "../playback/store";
import type { StepMode } from "../playback/steps";
import { InfoButton } from "./Panel";

const MODES: { mode: StepMode; label: string; tip: string }[] = [
  { mode: "tick", label: "Tick", tip: "Step one clock tick: gates fire, then every walker moves one site" },
  { mode: "gate", label: "Gate", tip: "Step to the next tick in which a clock-scheduled gate acts" },
  { mode: "level", label: "Level", tip: "Step to the next time the leading walker crosses a bifurcation" },
  { mode: "phase", label: "Phase", tip: "Step to the next phase: routing, query, inverse routing, end" },
];

const PHASE_NAMES: Record<string, string> = {
  init: "input",
  routing: "routing",
  query: "query",
  inverse: "inverse routing",
};

export function Timeline() {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const progress = usePlayback((s) => s.progress);
  const seek = usePlayback((s) => s.seek);
  const bar = useRef<HTMLDivElement>(null);
  const bands = useMemo(() => (traj ? phaseBands(traj) : []), [traj]);
  const marks = useMemo(() => {
    if (!traj) return [];
    return traj.frames.flatMap((f, i) =>
      f.events.some((e) => e.kind === "gate" && e.fired_in.length > 0) ? [i] : [],
    );
  }, [traj]);
  if (!traj) return null;
  const last = traj.frames.length - 1;
  const pos = (frame - 1 + progress) / last;
  const toFrame = (clientX: number) => {
    const r = bar.current!.getBoundingClientRect();
    return ((clientX - r.left) / r.width) * last;
  };
  return (
    <div
      className="timeline"
      ref={bar}
      data-testid="timeline"
      title="Timeline: click or drag to jump; coloured bands are the phases, dark ticks are gates that acted"
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        seek(toFrame(e.clientX));
      }}
      onPointerMove={(e) => {
        if (e.buttons === 1) seek(toFrame(e.clientX));
      }}
    >
      {bands.map((b) => (
        <div
          key={b.phase}
          className={`band band-${b.phase}`}
          style={{ left: `${(Math.max(0, b.start - 0.5) / last) * 100}%`, width: `${((b.end - b.start + 1) / last) * 100}%` }}
        >
          <span>{PHASE_NAMES[b.phase] ?? b.phase}</span>
        </div>
      ))}
      {marks.map((i) => (
        <div key={i} className="mark" style={{ left: `${(i / last) * 100}%` }} />
      ))}
      <div className="thumb" style={{ left: `${Math.max(0, Math.min(1, pos)) * 100}%` }} />
    </div>
  );
}

export function Controls() {
  const s = usePlayback();
  const traj = s.traj;
  const disabled = !traj;
  const last = traj ? traj.frames.length - 1 : 0;
  const cur = traj?.frames[s.frame];
  return (
    <div className="controls" data-testid="controls">
      <div className="controls-row">
        <button className="btn icon" disabled={disabled} title="Go to the input state (Home)" aria-label="Go to start" onClick={() => s.seek(0)}>
          ⏮
        </button>
        <button
          className="btn icon"
          disabled={disabled}
          title={`Step back (${s.stepMode} mode, ←)`}
          aria-label="Step back"
          data-testid="step-back"
          onClick={() => s.step(-1)}
        >
          ◀
        </button>
        <button
          className="btn icon primary"
          disabled={disabled}
          title="Play / pause (space)"
          aria-label={s.playing ? "Pause" : "Play"}
          data-testid="play"
          onClick={s.togglePlay}
        >
          {s.playing ? "⏸" : "▶"}
        </button>
        <button
          className="btn icon"
          disabled={disabled}
          title={`Step forward (${s.stepMode} mode, →)`}
          aria-label="Step forward"
          data-testid="step-forward"
          onClick={() => s.step(1)}
        >
          ▶︎|
        </button>
        <button className="btn icon" disabled={disabled} title="Go to the output state (End)" aria-label="Go to end" data-testid="to-end" onClick={() => s.seek(last)}>
          ⏭
        </button>
        <span className="sep" />
        <span className="muted">Step by</span>
        {MODES.map((m) => (
          <button
            key={m.mode}
            className={`btn ${s.stepMode === m.mode ? "active" : ""}`}
            title={m.tip}
            data-testid={`mode-${m.mode}`}
            onClick={() => s.setStepMode(m.mode)}
          >
            {m.label}
          </button>
        ))}
        {s.stepMode === "gate" && (
          <label className="field" title="Also stop at gates whose control walker was absent in every branch (they fire on the clock but do nothing)">
            <input
              type="checkbox"
              checked={s.view.includeIdleGates}
              onChange={(e) => s.setView({ includeIdleGates: e.target.checked })}
            />
            idle gates
          </label>
        )}
        <span className="sep" />
        <label className="field" title="Playback speed in clock ticks per second">
          speed
          <input
            type="range"
            min={-2}
            max={4}
            step={0.5}
            value={Math.log2(s.speed)}
            onChange={(e) => s.setSpeed(2 ** Number(e.target.value))}
          />
          <span className="mono">{s.speed < 1 ? s.speed.toFixed(2) : s.speed.toFixed(1)}/s</span>
        </label>
        <span className="sep" />
        {["routing", "query", "inverse"].map((p) => (
          <button
            key={p}
            className="btn"
            disabled={disabled || !traj?.frames.some((f) => f.phase === p)}
            title={`Jump to the start of the ${PHASE_NAMES[p]} phase`}
            onClick={() => s.jumpPhase(p)}
          >
            {PHASE_NAMES[p]}
          </button>
        ))}
        <span className="spacer" />
        <span className="mono frame-counter" data-testid="frame-counter" title="Tick of the current frame (frame 0 is the input state)">
          {cur ? `${cur.t < 0 ? "input" : `tick ${cur.t}`} / ${traj!.meta.phases.T_total - 1} · ${PHASE_NAMES[cur.phase]}` : "—"}
        </span>
        <InfoButton anchor="ui-playback" topic="playback controls" />
      </div>
      <Timeline />
    </div>
  );
}
