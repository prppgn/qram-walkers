// Ket panel (DESIGN.md §7.5): the instantaneous state Σ_b α_b |…⟩ of the current
// frame, one row per branch, plus the paper's level-synchronous checkpoints ψ_in … ψ_out
// (DECISION D18). Everything is formatted from the trajectory; nothing is computed.
import { useState } from "react";
import type { Amp, BranchJSON, CheckpointJSON, SlotJSON } from "../../model/types";
import { branchLabel, formatAmp, modulus, phaseDeg, type KetOrder } from "../../layout/kets";
import { usePlayback } from "../../playback/store";
import { Ket } from "../Ket";
import { InfoButton, Panel } from "../Panel";
import { formulaParts, omittedText } from "./helpAnchors";
import "./panels.css";

/** A string with ^x / _x / ^{…} / _{…} rendered as superscripts and subscripts. */
export function Scripted({ text, className }: { text: string; className?: string }) {
  return (
    <span className={className}>
      {formulaParts(text).map((p, i) =>
        p.t === "sup" ? <sup key={i}>{p.v}</sup> : p.t === "sub" ? <sub key={i}>{p.v}</sub> : <span key={i}>{p.v}</span>,
      )}
    </span>
  );
}

/** Amplitude α as 0.7071 or 0.5000·e^{i90°}, with |α|² and arg α in the tooltip. */
export function AmpText({ amp }: { amp: Amp }) {
  const r = modulus(amp);
  return (
    <span className="pn-amp" title={`α = ${amp[0].toFixed(6)} ${amp[1] < 0 ? "−" : "+"} ${Math.abs(amp[1]).toFixed(6)} i,  |α|² = ${(r * r).toFixed(6)},  arg α = ${phaseDeg(amp).toFixed(1)}°`}>
      <Scripted text={formatAmp(amp)} />
    </span>
  );
}

function CheckpointCard(props: {
  cp: CheckpointJSON;
  slots: SlotJSON[];
  inputs: { id: number; address: string }[];
  labels?: Record<string, string>;
  order: KetOrder;
  positions: boolean;
  current: boolean;
  onShow: () => void;
}) {
  const { cp } = props;
  return (
    <div className={`pn-checkpoint ${props.current ? "current" : ""}`} data-testid="checkpoint">
      <div className="pn-checkpoint-head">
        <Scripted text={cp.name} className="pn-checkpoint-name" />
        <span className="muted pn-small">{cp.description}</span>
        <span className="spacer" />
        <span className="muted pn-small mono" title="Tick at which the last slot of this checkpoint is taken">
          t = {cp.t}
        </span>
        <button
          className="btn pn-btn-sm"
          title={`Jump to the end of tick ${cp.t} (frame ${cp.t + 1}), where this checkpoint is completed`}
          onClick={props.onShow}
        >
          Show
        </button>
      </div>
      {cp.branches.map((b) => (
        <div key={b.id} className="pn-checkpoint-ket">
          <span className="pn-branch">{branchLabel(b.id, props.inputs, props.labels)}</span>
          <AmpText amp={b.amp} />
          <Ket branch={b} slots={props.slots} order={props.order} positions={props.positions} />
        </div>
      ))}
    </div>
  );
}

function KetRow(props: {
  branch: BranchJSON;
  slots: SlotJSON[];
  label: string;
  order: KetOrder;
  positions: boolean;
  highlight: number | null;
  onToggle: () => void;
}) {
  const { branch: b, highlight } = props;
  const cls = highlight === null ? "" : highlight === b.id ? "hl" : "dim";
  const p = modulus(b.amp) ** 2;
  return (
    <button
      className={`pn-ket-row ${cls}`}
      data-testid="ket-row"
      aria-pressed={highlight === b.id}
      title={
        highlight === b.id
          ? "Click to remove the highlight"
          : `Branch ${props.label} (|α|² = ${p.toFixed(4)}): click to highlight it in every view and dim the others`
      }
      onClick={props.onToggle}
    >
      <span className="pn-branch">{props.label}</span>
      <AmpText amp={b.amp} />
      <span className="pn-ket-body">
        <Ket branch={b} slots={props.slots} order={props.order} positions={props.positions} />
      </span>
    </button>
  );
}

export function KetPanel() {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const order = usePlayback((s) => s.view.ketOrder);
  const positions = usePlayback((s) => s.view.ketPositions);
  const highlight = usePlayback((s) => s.highlight);
  const setHighlight = usePlayback((s) => s.setHighlight);
  const setView = usePlayback((s) => s.setView);
  const seek = usePlayback((s) => s.seek);
  const [showCheckpoints, setShowCheckpoints] = useState(false);

  const actions = (
    <>
      <button
        className="btn pn-btn-sm"
        title={
          order === "paper"
            ? "Factors in the paper's order, tail → front (as in the appendix). Click for train order, front → tail."
            : "Factors in train order, front → tail. Click for the paper's order, tail → front."
        }
        onClick={() => setView({ ketOrder: order === "paper" ? "train" : "paper" })}
      >
        {order === "paper" ? "tail → front" : "front → tail"}
      </button>
      <button
        className={`btn pn-btn-sm ${positions ? "active" : ""}`}
        aria-pressed={positions}
        title={positions ? "Hide the position superscripts (d,l)" : "Show the position superscripts (d,l)"}
        onClick={() => setView({ ketPositions: !positions })}
      >
        (d,l)
      </button>
    </>
  );

  if (!traj) {
    return (
      <Panel title="State" help="ui-kets" helpTopic="the ket panel" actions={actions} testId="ket-panel">
        <p className="muted pn-empty">No trajectory loaded.</p>
      </Panel>
    );
  }

  const f = traj.frames[frame]!;
  const { slots, input_normalised: inputs, branch_labels: labels } = traj.meta;
  const checkpoints = traj.final.checkpoints ?? [];
  const multi = f.branches.length > 1;
  // branches split off by coherent errors carry a primed label such as |10⟩′3 (D30)
  const split = f.branches.some((b) => labels?.[String(b.id)]?.includes("′"));

  return (
    <Panel title="State" help="ui-kets" helpTopic="the ket panel" actions={actions} testId="ket-panel">
      <div className="pn-ket-list">
        {f.branches.map((b) => (
          <KetRow
            key={b.id}
            branch={b}
            slots={slots}
            label={branchLabel(b.id, inputs, labels)}
            order={order}
            positions={positions}
            highlight={highlight}
            onToggle={() => setHighlight(highlight === b.id ? null : b.id)}
          />
        ))}
      </div>
      {f.omitted && f.omitted.count > 0 && (
        <p className="pn-omitted" data-testid="ket-omitted">
          <span title="The trajectory stores only the largest-weight branches of each frame (record.max_frame_branches); the metrics always use the full state">
            + {omittedText(f.omitted)}.
          </span>
          <InfoButton anchor="noise-pruning" topic="branches not stored and pruning" />
        </p>
      )}
      <p className="muted pn-caption">
        |ψ⟩ = Σ α |…⟩
        {multi
          ? `, ${f.branches.length} ${f.omitted ? "stored " : ""}branches labelled by their input address${
              split ? " (in a label, ′k numbers the branches split off by coherent errors)" : ""
            }`
          : ""}
        . Superscript
        (d,l): level d and branch l of the edge holding the walker (an empty slot ∅ shows only its level); a prime
        d′ marks the inverse phase (walker moving back); in / out: on the port line before entering / after
        leaving. Subscripts name the slots.
        <InfoButton anchor="kets" topic="reading the kets" />
      </p>

      <div className="pn-section-toggle">
        <button
          className="pn-disclosure"
          aria-expanded={showCheckpoints}
          title={showCheckpoints ? "Hide the paper checkpoints" : "Show the paper checkpoints ψ_in … ψ_out"}
          onClick={() => setShowCheckpoints(!showCheckpoints)}
        >
          {showCheckpoints ? "▾" : "▸"} Paper checkpoints (ψ<sub>in</sub> … ψ<sub>out</sub>)
        </button>
        <span className="muted pn-small">{checkpoints.length}</span>
        <InfoButton anchor="faq-kets" topic="why the kets differ from the paper's ψ_1, ψ_2, …" />
      </div>
      {showCheckpoints && (
        <>
          <p className="muted pn-caption">
            Level-synchronous kets of the paper's appendix: each slot is taken when it stands on the level in
            question, so they can mix several ticks. The rows above are the instantaneous state of this tick.
          </p>
          {checkpoints.length === 0 ? (
            <p className="muted pn-empty">This trajectory has no checkpoints.</p>
          ) : (
            <div className="pn-checkpoints">
              {checkpoints.map((cp) => (
                <CheckpointCard
                  key={cp.name}
                  cp={cp}
                  slots={slots}
                  inputs={inputs}
                  labels={labels}
                  order={order}
                  positions={positions}
                  current={frame === cp.t + 1}
                  onShow={() => seek(cp.t + 1)}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Panel>
  );
}
