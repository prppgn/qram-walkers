// Noise summary of a run (DESIGN.md §4, DECISIONS D27, D30): the channels as the engine
// parsed them, the seed, the classical errors drawn before the run (memory flips, clock
// jitter) and the static values of the coherent errors sampled for this run. Shown at the
// top of the metrics panel when the trajectory carries `meta.noise`.
import { useState } from "react";
import type { NoiseMetaJSON, Trajectory } from "../../model/types";
import { InfoButton } from "../Panel";
import {
  coherentSamples,
  formatParam,
  jitterText,
  memoryFlipText,
  noiseChannelRows,
  noiseSampleNote,
  sampleSummary,
} from "./helpAnchors";
import { Scripted } from "./KetPanel";
import "./panels.css";

const MAX_LISTED = 12;
/** Sampled coherent values shown expanded up to this many rows, collapsed beyond. */
const OPEN_SAMPLES = 6;

/** Comma-separated list; `scripted` renders _x / ^x as sub/superscripts (not for gate ids). */
function Listed({ items, empty, scripted = false }: { items: string[]; empty: string; scripted?: boolean }) {
  if (items.length === 0) return <span className="muted">{empty}</span>;
  const shown = items.slice(0, MAX_LISTED);
  return (
    <span className="mono">
      {shown.map((t, i) => (
        <span key={i}>
          {i > 0 && ", "}
          {scripted ? <Scripted text={t} /> : t}
        </span>
      ))}
      {items.length > MAX_LISTED && <span className="muted"> and {items.length - MAX_LISTED} more</span>}
    </span>
  );
}

/** The static ε (per gate and edge) and η (per node) drawn for this run, with a summary
 *  line each and a table that starts collapsed when long. */
function CoherentValues({ noise }: { noise: NoiseMetaJSON }) {
  const { overrotation, imbalance } = coherentSamples(noise);
  const total = overrotation.length + imbalance.length;
  const [open, setOpen] = useState(total <= OPEN_SAMPLES);
  if (total === 0) return null;
  return (
    <div className="pn-coherent" data-testid="coherent-samples">
      <div className="pn-noise-kv">
        {overrotation.length > 0 && (
          <>
            <span title="Over-rotation ε of each controlled gate and edge, drawn once per run from N(ε, σ) and used by the forward and the inverse firing">
              sampled ε
            </span>
            <span className="mono">{sampleSummary(overrotation.map((r) => r.epsilon))}</span>
          </>
        )}
        {imbalance.length > 0 && (
          <>
            <span title="Imbalance η of each bifurcation node (d,l), drawn once per run from N(η, σ)">sampled η</span>
            <span className="mono">{sampleSummary(imbalance.map((r) => r.eta))}</span>
          </>
        )}
      </div>
      <button
        className="pn-disclosure pn-small"
        aria-expanded={open}
        title={open ? "Hide the table of sampled values" : "Show the value sampled for every gate edge and node"}
        onClick={() => setOpen(!open)}
      >
        {open ? "▾" : "▸"} sampled values ({total})
      </button>
      {open && (
        <div className="pn-table-wrap pn-coherent-table">
          <table className="grid pn-compact">
            <thead>
              <tr>
                <th title="Coherent error model">model</th>
                <th title="Where the static value applies: gate and edge l (over-rotation) or bifurcation node (d,l) (imbalance)">
                  where
                </th>
                <th title="Sampled value: ε (over-rotation, θ = επ/2) or η (imbalance, φ = ηπ/2)">value</th>
              </tr>
            </thead>
            <tbody>
              {overrotation.map((r, i) => (
                <tr key={`o${i}`}>
                  <td>over-rotation</td>
                  <td className="mono">
                    {r.gate}, edge {r.edge}
                  </td>
                  <td className="mono" title={`ε = ${r.epsilon}`}>
                    ε = {formatParam(r.epsilon)}
                  </td>
                </tr>
              ))}
              {imbalance.map((r, i) => (
                <tr key={`b${i}`}>
                  <td>imbalance</td>
                  <td className="mono">
                    node ({r.node[0]},{r.node[1]})
                  </td>
                  <td className="mono" title={`η = ${r.eta}`}>
                    η = {formatParam(r.eta)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export function NoiseSummary({ traj }: { traj: Pick<Trajectory, "meta" | "config"> }) {
  const noise = traj.meta.noise;
  if (!noise) return null;
  const rows = noiseChannelRows(noise, traj.meta, traj.config.noise);
  const models = new Set(noise.channels.map((c) => c.model));
  const showFlips = models.has("memory_bit_flip") || noise.memory_flips.length > 0;
  const showJitter = models.has("clock_jitter") || noise.jitter.length > 0;

  return (
    <div className="pn-noise" data-testid="noise-summary">
      <div className="pn-noise-head">
        <span className="badge k-noise" title="This run was simulated with noise">
          noise
        </span>
        <span>Noise in this run</span>
        <InfoButton anchor="noise" topic="noise models" />
      </div>
      <ul className="pn-noise-channels">
        {rows.map((r, i) => (
          <li key={i} className={r.active ? "" : "inactive"} data-testid={`noise-channel-${r.model}`}>
            <div className="pn-noise-line">
              <span className="pn-noise-model" title={r.help}>
                {r.name}
              </span>
              <InfoButton anchor={r.anchor} topic={`noise model: ${r.name}`} />
              <Scripted text={r.prob} className="mono pn-small" />
              {!r.active && (
                <span
                  className="badge"
                  title={
                    r.coherent
                      ? "Strength 0 and σ = 0: the engine skips this channel, the run is ideal for it"
                      : "Probability 0: the engine skips this channel, the run is ideal for it"
                  }
                >
                  off
                </span>
              )}
              {r.coherent && (
                <span className="badge pn-badge-coherent" title="Coherent error: a static miscalibration that splits branches instead of jumping">
                  coherent
                </span>
              )}
            </div>
            <div className="pn-noise-detail muted">
              <span title="Where the channel acts: propagation = after each move inside the tree; tree gates / lane gates = on the window sites after a gate fires; bifurcations = before Ŝ/Ŝ†; idle = every query tick">
                at {r.where}
              </span>
              {" · "}
              <span title="Slots the Kraus channel acts on, or the unit a classical error is drawn for">on {r.targets}</span>
              {" · "}
              <span title="Phases of the protocol where the channel is applied">{r.phases}</span>
              {r.extra.map((x) => (
                <span key={x.text}>
                  {" · "}
                  <span title={x.title} className="pn-convention">
                    {x.text}
                  </span>
                </span>
              ))}
            </div>
          </li>
        ))}
      </ul>
      <div className="pn-noise-kv">
        <span title="Seed of the random generator: the same configuration and seed reproduce this trajectory exactly">seed</span>
        <span className="mono">{noise.seed}</span>
        {showFlips && (
          <>
            <span title="Stored bits b_j of cell |a⟩ flipped before the run; the copies read them, fidelity and consistency compare with the intended memory">
              memory flips
            </span>
            <Listed items={noise.memory_flips.map(memoryFlipText)} empty="none in this sample" scripted />
          </>
        )}
        {showJitter && (
          <>
            <span title="Gate instances whose firing tick the clock jitter moved (forward and inverse instances are drawn independently)">
              jittered gates
            </span>
            <Listed items={noise.jitter.map(jitterText)} empty="none in this sample" />
          </>
        )}
      </div>
      <CoherentValues noise={noise} />
      <p className="pn-noise-note" data-testid="noise-note">
        {noiseSampleNote(traj)}
      </p>
    </div>
  );
}
