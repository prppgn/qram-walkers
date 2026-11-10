// Phasor panel (DESIGN.md §7.5): one disc per branch of the current frame, radius ∝ |α|
// (largest branch = full size), arrow at arg α, coloured with the same phase hue as the
// rings on the canvas. Pure formatting of the recorded amplitudes.
import { branchLabel, modulus, phaseDeg } from "../../layout/kets";
import { usePlayback } from "../../playback/store";
import { Panel } from "../Panel";
import "./panels.css";

const SIZE = 60;
const C = SIZE / 2;
const RMAX = C - 4;

function Arrow({ r, deg, color }: { r: number; deg: number; color: string }) {
  if (r < 1.5) return null;
  const th = (deg * Math.PI) / 180;
  // SVG y grows downward: a positive angle turns counter-clockwise on screen.
  const ux = Math.cos(th);
  const uy = -Math.sin(th);
  const tipX = C + r * ux;
  const tipY = C + r * uy;
  const head = Math.min(6, r * 0.45);
  const bx = tipX - head * ux;
  const by = tipY - head * uy;
  const px = -uy * head * 0.5;
  const py = ux * head * 0.5;
  return (
    <g style={{ stroke: color, fill: color }}>
      <line x1={C} y1={C} x2={bx} y2={by} strokeWidth={1.8} />
      <polygon points={`${tipX},${tipY} ${bx + px},${by + py} ${bx - px},${by - py}`} strokeWidth={0.5} />
    </g>
  );
}

export function PhasorPanel() {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const highlight = usePlayback((s) => s.highlight);
  const setHighlight = usePlayback((s) => s.setHighlight);

  if (!traj) {
    return (
      <Panel title="Phasors" help="ui-phasors" helpTopic="the phasor panel" testId="phasor-panel">
        <p className="muted pn-empty">No trajectory loaded.</p>
      </Panel>
    );
  }
  const f = traj.frames[frame]!;
  const rmax = Math.max(...f.branches.map((b) => modulus(b.amp)), 1e-300);

  return (
    <Panel title="Phasors" help="ui-phasors" helpTopic="the phasor panel" testId="phasor-panel">
      <div className="pn-phasors">
        {f.branches.map((b) => {
          const a = modulus(b.amp);
          const deg = phaseDeg(b.amp);
          const r = (RMAX * a) / rmax;
          const label = branchLabel(b.id, traj.meta.input_normalised, traj.meta.branch_labels);
          const cls = highlight === null ? "" : highlight === b.id ? "hl" : "dim";
          const color = `hsl(${deg.toFixed(0)}, 75%, 48%)`;
          return (
            <button
              key={b.id}
              className={`pn-phasor ${cls}`}
              data-testid="phasor"
              aria-pressed={highlight === b.id}
              aria-label={`Branch ${label}: |α| = ${a.toFixed(4)}, arg α = ${deg.toFixed(0)}°`}
              title={`Branch ${label}: |α| = ${a.toFixed(4)}, |α|² = ${(a * a).toFixed(4)}, arg α = ${deg.toFixed(1)}°. Click to ${
                highlight === b.id ? "remove the highlight" : "highlight this branch"
              }.`}
              onClick={() => setHighlight(highlight === b.id ? null : b.id)}
            >
              <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} aria-hidden="true">
                <line className="axis" x1={2} y1={C} x2={SIZE - 2} y2={C} />
                <line className="axis" x1={C} y1={2} x2={C} y2={SIZE - 2} />
                <circle className="ref" cx={C} cy={C} r={RMAX} />
                <circle className="disc" cx={C} cy={C} r={Math.max(r, 0.5)} />
                <Arrow r={r} deg={deg} color={color} />
              </svg>
              <span className="pn-phasor-label">
                <span className="mono">{label}</span>
                <br />
                <span className="muted">|α|² {(a * a).toFixed(3)}</span>
              </span>
            </button>
          );
        })}
      </div>
      <p className="muted pn-caption">
        Radius ∝ |α| (largest branch = dashed circle), arrow at arg α, colour = phase hue of the rings on the tree. Only
        relative phases matter.
      </p>
    </Panel>
  );
}
