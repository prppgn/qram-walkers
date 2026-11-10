// Narration (DESIGN.md §7.5, DECISION D8): the engine's sentences for the events of the
// current frame, in order, with a kind badge and an "Explain" link into the user guide.
// Noise-related events (noise, strays, collisions, absorptions) are tinted.
import { branchLabel } from "../../layout/kets";
import type { EventJSON } from "../../model/types";
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

function EventItem({ e, onExplain }: { e: EventJSON; onExplain: () => void }) {
  const idle = isIdleGate(e);
  const noisy = isNoiseEvent(e);
  return (
    <li className={`pn-event ${idle ? "idle" : ""} ${noisy ? "noise" : ""}`}>
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
      <button className="btn pn-btn-sm" title="Open the user guide where this step is explained" onClick={onExplain}>
        Explain
      </button>
    </li>
  );
}

export function Narration() {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const openHelp = usePlayback((s) => s.openHelp);
  const variant = traj?.meta.variant;

  if (!traj) {
    return (
      <Panel title="Narration" help="ui-narration" helpTopic="the narration" testId="narration">
        <p className="muted pn-empty">No trajectory loaded.</p>
      </Panel>
    );
  }
  const f = traj.frames[frame]!;
  const marks = (traj.meta.marks?.level ?? []).filter((m) => m.t === f.t);
  const collided = collidedBranches(f);
  const who =
    f.branches.length > 1
      ? `Branch${collided.length > 1 ? "es" : ""} ${collided.map((b) => branchLabel(b, traj.meta.input_normalised, traj.meta.branch_labels)).join(", ")} ${collided.length > 1 ? "have" : "has"}`
      : "This branch has";

  return (
    <Panel title="Narration" help="ui-narration" helpTopic="the narration" testId="narration">
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
      {marks.map((m) => (
        <p key={m.label} className="pn-mark" title="Level step: the leading walker crosses a bifurcation">
          ▸ {m.label}
        </p>
      ))}
      {f.events.length === 0 ? (
        <p className="muted pn-empty">{quietFrameText(traj, frame)}</p>
      ) : (
        <ol className="pn-events">
          {f.events.map((e, i) => (
            <EventItem key={i} e={e} onExplain={() => openHelp(anchorForEvent(e, variant))} />
          ))}
        </ol>
      )}
    </Panel>
  );
}
