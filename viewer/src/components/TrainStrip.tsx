// The train as a line of slots, independent of the tree (DESIGN.md §7.4): colours of
// every slot in every branch at the current frame, so long-range flips are visible even
// when the train spans several levels.
import { modulus } from "../layout/kets";
import { branchLabel } from "../layout/kets";
import { usePlayback } from "../playback/store";
import { compactGlyph, describeState, discClass } from "../model/states";
import { InfoButton } from "./Panel";

const MAX_ROWS = 8;

export function TrainStrip() {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const order = usePlayback((s) => s.view.ketOrder);
  const highlight = usePlayback((s) => s.highlight);
  const setHighlight = usePlayback((s) => s.setHighlight);
  if (!traj) return null;
  const f = traj.frames[frame]!;
  const slots = traj.meta.slots;
  const idx = slots.map((s) => s.k);
  if (order === "paper") idx.reverse();
  let rows = f.branches;
  if (rows.length > MAX_ROWS) {
    rows = highlight !== null ? rows.filter((b) => b.id === highlight) : rows.slice(0, MAX_ROWS);
  }
  return (
    <div className="train-strip" data-testid="train-strip">
      <div className="train-head">
        <span>Train</span>
        <span className="muted">{order === "paper" ? "tail → front (paper order)" : "front → tail"}</span>
        <InfoButton anchor="ui-train" topic="the train strip" />
        {f.branches.length > rows.length && (
          <span className="muted">
            showing {rows.length} of {f.branches.length} branches{highlight === null ? " (click a ket to pick one)" : ""}
          </span>
        )}
      </div>
      <div className="train-rows">
        {rows.map((b) => (
          <div
            key={b.id}
            className={`train-row ${highlight !== null && highlight !== b.id ? "dim" : ""}`}
            title={`Branch ${branchLabel(b.id, traj.meta.input_normalised, traj.meta.branch_labels)}, |α|² = ${(modulus(b.amp) ** 2).toFixed(4)}: click to highlight`}
            onClick={() => setHighlight(highlight === b.id ? null : b.id)}
          >
            <span className="mono train-branch">{branchLabel(b.id, traj.meta.input_normalised, traj.meta.branch_labels)}</span>
            {idx.map((k) => {
              const w = b.walkers[k]!;
              return (
                <span key={k} className="train-slot" title={`${slots[k]!.label}: ${describeState(w.s)}`}>
                  <span className={`train-disc ${discClass(w.s)}`}>{compactGlyph(w.s)}</span>
                  <span className="train-label">{slots[k]!.label}</span>
                </span>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
