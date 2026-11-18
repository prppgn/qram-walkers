// Narration (DESIGN.md §7.5, DECISION D8): a log of the engine's sentences that grows as the
// run advances: every event of every frame up to the current one, in order, under section
// headers ("Level 1", "Query", "Return"), new lines at the bottom. Clicking a line jumps to
// its tick; "Explain" opens the user guide there. Noise-related events are tinted.
import { useEffect, useMemo, useRef } from "react";
import { branchLabel } from "../../layout/kets";
import type { EventJSON, Trajectory } from "../../model/types";
import { logSections } from "../../playback/moments";
import { usePlayback } from "../../playback/store";
import { InfoButton, Panel } from "../Panel";
import {
  anchorForEvent,
  collidedBranches,
  eventKindLabel,
  eventKindTitle,
  isIdleGate,
  isNoiseEvent,
  phaseName,
  quietFrameText,
  tickLabel,
} from "./helpAnchors";
import { Scripted } from "./KetPanel";
import "./panels.css";

type LogItem =
  | { kind: "section"; frame: number; title: string }
  | { kind: "mark"; frame: number; text: string }
  | { kind: "event"; frame: number; t: number; e: EventJSON };

/** The log up to `frame`: sections, level marks and events, in order. */
export function logItems(traj: Trajectory, frame: number): LogItem[] {
  const sections = logSections(traj);
  const marks = traj.meta.marks?.level ?? [];
  const out: LogItem[] = [];
  for (let i = 1; i <= Math.min(frame, traj.frames.length - 1); i++) {
    const f = traj.frames[i]!;
    for (const s of sections) if (s.frame === i) out.push({ kind: "section", frame: i, title: s.title });
    for (const m of marks) if (m.t === f.t) out.push({ kind: "mark", frame: i, text: m.label });
    for (const e of f.events) out.push({ kind: "event", frame: i, t: f.t, e });
  }
  return out;
}

function EventItem({ e, frame, t, current, onSeek, onExplain }: { e: EventJSON; frame: number; t: number; current: boolean; onSeek: () => void; onExplain: () => void }) {
  const idle = isIdleGate(e);
  const noisy = isNoiseEvent(e);
  return (
    <li
      className={`pn-event pn-log-line${idle ? " idle" : ""}${noisy ? " noise" : ""}${current ? " current" : ""}`}
      data-testid="log-line"
      data-frame={frame}
      role="button"
      tabIndex={0}
      title={`Tick ${t}: click to go there`}
      onClick={onSeek}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") {
          ev.preventDefault();
          onSeek();
        }
      }}
    >
      <span>
        <span className={`badge k-${e.kind}`} title={eventKindTitle(e)}>
          {eventKindLabel(e)}
        </span>
        {idle && (
          <>
            {" "}
            <span className="badge k-idle" title="The control was absent (∅) in every branch: the gate acted as the identity">
              idle
            </span>
          </>
        )}
      </span>
      <Scripted text={e.text} className="pn-event-text" />
      <button
        className="btn pn-btn-sm"
        title="Open the user guide where this step is explained"
        onClick={(ev) => {
          ev.stopPropagation();
          onExplain();
        }}
      >
        Explain
      </button>
    </li>
  );
}

export function Narration({ fill = false }: { fill?: boolean }) {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const openHelp = usePlayback((s) => s.openHelp);
  const seek = usePlayback((s) => s.seek);
  const list = useRef<HTMLDivElement>(null);
  const items = useMemo(() => (traj ? logItems(traj, frame) : []), [traj, frame]);

  // new lines at the bottom: keep the end of the log in view
  useEffect(() => {
    const el = list.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items.length, traj]);

  if (!traj) {
    return (
      <Panel title="Narration" help="ui-narration" helpTopic="the narration" testId="narration">
        <p className="muted pn-empty">No trajectory loaded.</p>
      </Panel>
    );
  }
  const variant = traj.meta.variant;
  const f = traj.frames[frame]!;
  const collided = collidedBranches(f);
  const who =
    f.branches.length > 1
      ? `Branch${collided.length > 1 ? "es" : ""} ${collided.map((b) => branchLabel(b, traj.meta.input_normalised, traj.meta.branch_labels)).join(", ")} ${collided.length > 1 ? "have" : "has"}`
      : "This branch has";

  return (
    <Panel title="Narration" help="ui-narration" helpTopic="the narration" testId="narration" className={fill ? "pn-narration fill" : "pn-narration"}>
      <div className="pn-tickbar">
        <span className="mono pn-small" title="Current tick out of the last tick T_total − 1 (frame i is the end of tick i − 1)">
          {tickLabel(traj, frame)}
        </span>
        <span className={`pn-phase-chip ph-${f.phase}`} title="Phase of the protocol at this tick">
          {phaseName(f.phase)}
        </span>
      </div>
      {collided.length > 0 && (
        <p className="pn-collided" data-testid="collided-warning">
          <span>
            ⚠ {who} collided (two walkers on one site): {collided.length > 1 ? "they are" : "it is"} frozen and{" "}
            {collided.length > 1 ? "count" : "counts"} as a failure.
          </span>
          <InfoButton anchor="noise-collisions" topic="collisions" />
        </p>
      )}
      <div className="pn-log" ref={list} data-testid="narration-log" aria-live="polite">
        <p className={`pn-log-start${frame === 0 ? " current" : ""}`}>{quietFrameText(traj, 0)}</p>
        <ol className="pn-events">
          {items.map((it, i) =>
            it.kind === "section" ? (
              <li key={i} className="pn-log-section" data-testid="log-section">
                {it.title}
              </li>
            ) : it.kind === "mark" ? (
              <li key={i} className="pn-mark" title="Level step: the leading walker crosses a bifurcation">
                ▸ {it.text}
              </li>
            ) : (
              <EventItem
                key={i}
                e={it.e}
                frame={it.frame}
                t={it.t}
                current={it.frame === frame}
                onSeek={() => seek(it.frame)}
                onExplain={() => openHelp(anchorForEvent(it.e, variant))}
              />
            ),
          )}
        </ol>
        {frame > 0 && f.events.length === 0 && <p className="muted pn-log-now">{quietFrameText(traj, frame)}</p>}
      </div>
    </Panel>
  );
}
