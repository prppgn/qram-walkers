// Metrics panel (DESIGN.md §7.5): the engine's output metrics (engine/src/qramsim/
// metrics.py) with a one-line explanation each, the readout table of the output
// branches, and per-frame metrics when the run recorded them. Noisy runs add a noise
// summary and an ensemble mode: the engine repeats the configuration with successive
// seeds and returns mean, standard deviation and standard error (DESIGN.md §4.4).
import { useRef, useState } from "react";
import { engine } from "../../engine/client";
import { branchLabel } from "../../layout/kets";
import type { EnsembleJSON, Trajectory } from "../../model/types";
import { usePlayback } from "../../playback/store";
import { InfoButton, Panel } from "../Panel";
import {
  ENSEMBLE_DEFAULT_RUNS,
  ENSEMBLE_KEYS,
  ENSEMBLE_MAX_RUNS,
  formatEstimate,
  formatNearOne,
  formatWeight,
  noiseRandomness,
  omittedText,
  parseRuns,
  runSeed,
} from "./helpAnchors";
import { Scripted } from "./KetPanel";
import { NoiseSummary } from "./NoiseSummary";
import "./panels.css";

interface MetricInfo {
  name: string;
  help: string;
  anchor?: string;
  /** Should be exactly 1 in an ideal run: shown as "1 − ε" and flagged when below. */
  nearOne?: boolean;
  /** Should be exactly 0 in an ideal run: flagged when above. */
  nearZero?: boolean;
  /** A probability weight that may be tiny: shown as 1.2e−5 below 10⁻³. */
  weight?: boolean;
  /** A lower bound when weight was discarded by pruning (D30): shown as "≥ …". */
  boundedByDiscard?: boolean;
  unit?: string;
}

const METRICS: Record<string, MetricInfo> = {
  fidelity: {
    name: "Fidelity F",
    help: "|⟨ψ_ideal|ψ_out⟩|² with ψ_ideal = Σ_a α_a |a⟩_A |b^{(a)}⟩_D of Eq. (1): 1 means the qRAM worked exactly.",
    anchor: "fidelity",
    nearOne: true,
    boundedByDiscard: true,
  },
  success: {
    name: "Success probability",
    help: "Probability that the output branch is well formed: every walker left in its slot, red, flags present, switches off.",
    anchor: "success",
    nearOne: true,
    boundedByDiscard: true,
  },
  consistency: {
    name: "Consistency",
    help: "Given a well-formed output, probability that the retrieved data equal the stored b^{(a)} of the address.",
    anchor: "consistency",
    nearOne: true,
  },
  entropy_AD: {
    name: "Entanglement entropy S(ρ_A)",
    help: "Entanglement entropy of the address register with data + switches; ideally the Shannon entropy of the retrieved data.",
    anchor: "entropy",
    unit: "bits",
  },
  collided: {
    name: "Collided weight",
    help: "Weight of branches frozen by a collision (collided branches: two walkers on one site); 0 in an ideal run.",
    anchor: "noise-collisions",
    nearZero: true,
    weight: true,
  },
  discarded: {
    name: "Discarded weight",
    help: "Weight of the branches dropped by pruning under coherent errors (|α|² below the pruning threshold, or beyond the branch cap). Nothing is renormalised: when it is above 0, fidelity and success are lower bounds.",
    anchor: "noise-pruning",
    nearZero: true,
    weight: true,
  },
  norm: {
    name: "Norm ⟨ψ|ψ⟩",
    help: "Squared norm of the output state: 1 unless weight was discarded.",
    nearOne: true,
  },
  heralded_fidelity: {
    name: "Heralded fidelity ⟨F⟩/⟨success⟩",
    help: "Fidelity given a well-formed output: the runs whose output visibly failed are discarded. On the qudit and dual-rail variants a pure loss always shows, so this stays at 1; on the bosonic ones a lost walker can read as a valid 0.",
    anchor: "noise-heralding",
  },
  noise_events: {
    name: "Noise events per run",
    help: "Quantum jumps, gate failures, copy errors and coherent splits (over-rotated gates, imbalanced crossings) recorded in one run; memory flips, clock jitter and pruning are not counted.",
    anchor: "noise",
  },
};

const ORDER = ["fidelity", "success", "consistency", "entropy_AD", "collided", "discarded", "norm"];

function fmt(key: string, x: number): string {
  const info = METRICS[key];
  if (info?.nearOne) return formatNearOne(x);
  if (info?.weight) return formatWeight(Math.abs(x) < 1e-15 ? 0 : x);
  const v = (Math.abs(x) < 1e-12 ? 0 : x).toFixed(4);
  return info?.unit ? `${v} ${info.unit}` : v;
}

/** `discarded`: weight dropped by pruning in this run; fidelity and success are then lower bounds. */
function MetricRow({ k, value, discarded = 0 }: { k: string; value: number; discarded?: number }) {
  const info = METRICS[k];
  const bad = (info?.nearOne && value < 1 - 1e-9) || (info?.nearZero && value > 1e-12);
  const bound = info?.boundedByDiscard && discarded > 0;
  return (
    <div className="pn-metric" data-testid={`metric-${k}`}>
      <span className="pn-metric-name">
        {info?.name ?? k}
        {info?.anchor && <InfoButton anchor={info.anchor} topic={info.name} />}
      </span>
      <span
        className={`pn-metric-value ${bad ? "bad" : ""}`}
        title={`Full precision: ${value.toPrecision(17)}${
          bound ? `. Lower bound: weight ${formatWeight(discarded)} was discarded by pruning and not renormalised` : ""
        }`}
      >
        {bound ? "≥ " : ""}
        {fmt(k, value)}
      </span>
      {info && <Scripted text={info.help} className="pn-metric-help" />}
    </div>
  );
}

function sortedKeys(m: Record<string, number>): string[] {
  const known = ORDER.filter((k) => k in m);
  return [...known, ...Object.keys(m).filter((k) => !ORDER.includes(k))];
}

interface EnsembleRequest {
  /** Trajectory the request (and its result) belongs to. */
  traj: Trajectory;
  busy: boolean;
  result: EnsembleJSON | null;
  error: string | null;
}

const ENSEMBLE_TITLE =
  "Repeat this configuration with seeds seed₀, seed₀ + 1, … (frames off) and average the metrics over the runs (quantum-jump trajectories and draws of the static miscalibrations)";

function Ensemble({ traj }: { traj: Trajectory }) {
  const [runsText, setRunsText] = useState(String(ENSEMBLE_DEFAULT_RUNS));
  const [req, setReq] = useState<EnsembleRequest | null>(null);
  const counter = useRef(0);

  // State belongs to the trajectory it was computed for: a new trajectory clears it.
  const current = req && req.traj === traj ? req : null;
  const runs = parseRuns(runsText);
  const randomness = noiseRandomness(traj);
  const noisy = randomness === "stochastic" || randomness === "drawn";
  const seed0 = runSeed(traj);
  const busy = current?.busy ?? false;

  const disabledReason = !noisy
    ? randomness === "deterministic"
      ? "Only coherent errors with σ = 0: the run is deterministic, every run of the ensemble would repeat this one exactly."
      : "This run has no active noise channel (none configured, or every probability is 0): every run of the ensemble would repeat this one exactly."
    : runs === null
      ? `Enter a whole number of runs between 1 and ${ENSEMBLE_MAX_RUNS}.`
      : busy
        ? "The engine is running the ensemble…"
        : null;

  const start = async () => {
    if (runs === null || !noisy) return;
    const id = ++counter.current;
    setReq({ traj, busy: true, result: null, error: null });
    try {
      // The loaded trajectory's configuration, so the ensemble matches what is on screen.
      const result = await engine.ensemble(traj.config, runs, seed0);
      if (id === counter.current) setReq({ traj, busy: false, result, error: null });
    } catch (e) {
      if (id === counter.current) {
        setReq({ traj, busy: false, result: null, error: e instanceof Error ? e.message : String(e) });
      }
    }
  };

  const result = current?.result ?? null;
  return (
    <div className="pn-ensemble" data-testid="ensemble">
      <div className="pn-subhead">
        Ensemble of noisy runs
        <InfoButton anchor="noise-ensembles" topic="the ensemble mode" />
      </div>
      <div className="pn-ensemble-controls">
        <label title={`Number of noisy runs to average (1–${ENSEMBLE_MAX_RUNS}); the standard error falls as 1/√runs`}>
          runs
          <input
            type="number"
            min={1}
            max={ENSEMBLE_MAX_RUNS}
            step={1}
            value={runsText}
            disabled={!noisy}
            title={`Number of noisy runs to average (1–${ENSEMBLE_MAX_RUNS})`}
            aria-label="Number of ensemble runs"
            data-testid="ensemble-runs"
            onChange={(e) => setRunsText(e.target.value)}
          />
        </label>
        {/* The wrapper carries the tooltip: disabled buttons do not show their own in every browser. */}
        <span title={disabledReason ?? ENSEMBLE_TITLE}>
          <button
            className="btn pn-btn-sm"
            disabled={disabledReason !== null}
            title={disabledReason ?? ENSEMBLE_TITLE}
            aria-busy={busy}
            data-testid="ensemble-run"
            onClick={() => void start()}
          >
            {busy ? "Running…" : "Run ensemble"}
          </button>
        </span>
        <span className="muted pn-small" title="The ensemble starts at the seed of the displayed run, which is its first sample">
          seed₀ = {seed0}
        </span>
      </div>
      {!noisy && (
        <p className="muted pn-caption">
          {randomness === "deterministic"
            ? "Coherent errors with σ = 0 do not depend on the seed: the ensemble would be trivial."
            : "No active noise in this run: the ensemble would be trivial."}
        </p>
      )}
      {current?.error && (
        <p className="pn-bad pn-caption" role="alert">
          Ensemble failed: {current.error}
        </p>
      )}
      {result && (
        <div data-testid="ensemble-result">
          <table className="grid pn-compact pn-ensemble-table">
            <thead>
              <tr>
                <th title="Quantity averaged over the runs">quantity</th>
                <th title="Mean ± standard error of the mean (hover a value for the standard deviation)">
                  mean ± s.e.
                </th>
              </tr>
            </thead>
            <tbody>
              {ENSEMBLE_KEYS.filter((k) => k in result.mean).map((k) => {
                const info = METRICS[k];
                const mean = result.mean[k]!;
                const sem = result.sem[k] ?? 0;
                const std = result.std[k] ?? 0;
                return (
                  <tr key={k} data-testid={`ensemble-${k}`}>
                    <td title={info?.help}>
                      {info?.name ?? k}
                      {info?.anchor && <InfoButton anchor={info.anchor} topic={info.name} />}
                    </td>
                    <td
                      className="mono"
                      title={`mean = ${mean.toPrecision(10)}, standard deviation = ${std.toPrecision(4)}, standard error = ${sem.toPrecision(4)} (${result.runs} runs)`}
                    >
                      {formatEstimate(mean, sem)}
                      {info?.unit ? ` ${info.unit}` : ""}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <p className="muted pn-caption">
            {result.runs} runs, seeds {result.seed0} … {result.seed0 + result.runs - 1}. Fidelity, success and collided
            weight are linear in the state: their means estimate the values of the averaged (mixed) output state.
            Consistency and S(ρ_A) are averaged run by run. The heralded fidelity is a ratio of two means; it is left
            out if no output was well formed.
          </p>
        </div>
      )}
    </div>
  );
}

export function MetricsPanel() {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const highlight = usePlayback((s) => s.highlight);
  const setHighlight = usePlayback((s) => s.setHighlight);

  if (!traj) {
    return (
      <Panel title="Metrics" help="fidelity" helpTopic="the output metrics" testId="metrics-panel">
        <p className="muted pn-empty">No trajectory loaded.</p>
      </Panel>
    );
  }
  const metrics = traj.final.metrics;
  const frameMetrics = traj.frames[frame]?.metrics;
  const inputs = traj.meta.input_normalised;
  const labels = traj.meta.branch_labels;
  const discarded = metrics.discarded ?? 0;
  const stateOmitted = traj.final.state_omitted;

  return (
    <Panel title="Metrics" help="fidelity" helpTopic="the output metrics" testId="metrics-panel">
      {traj.meta.noise && <NoiseSummary traj={traj} />}
      <div className="pn-metrics">
        {sortedKeys(metrics).map((k) => (
          <MetricRow key={k} k={k} value={metrics[k]!} discarded={discarded} />
        ))}
      </div>
      {discarded > 0 && (
        <p className="pn-discarded" data-testid="discarded-note">
          <span>
            ⚠ Weight {formatWeight(discarded)} was discarded by pruning and nothing is renormalised: fidelity and success
            are lower bounds (≥).
          </span>
          <InfoButton anchor="noise-pruning" topic="pruning and discarded weight" />
        </p>
      )}
      <p className="muted pn-caption">Computed by the engine on the output state (after the last tick).</p>

      <Ensemble traj={traj} />

      {frameMetrics && Object.keys(frameMetrics).length > 0 && (
        <>
          <div className="pn-subhead">At this tick</div>
          <div className="pn-metrics">
            {sortedKeys(frameMetrics).map((k) => (
              <MetricRow key={k} k={k} value={frameMetrics[k]!} />
            ))}
          </div>
        </>
      )}

      <div className="pn-subhead">
        Readout of the output branches
        <InfoButton anchor="consistency" topic="readout and consistency" />
      </div>
      <div className="pn-table-wrap">
        <table className="grid pn-compact" data-testid="readout">
          <thead>
            <tr>
              <th title="Branch, labelled by its input address (′k: the k-th branch split off by a coherent error)">branch</th>
              <th title="Address read from the output address walkers">address</th>
              <th title="Data read from the output data walkers (– = none)">data</th>
              <th title="Bits stored in the memory cell of the address, b^(a)">
                b<sup>(a)</sup>
              </th>
              <th title="Probability |α|² of the branch">prob.</th>
              <th title="Well formed: every walker left in its slot, red, flags present, switches off">ok</th>
            </tr>
          </thead>
          <tbody>
            {traj.final.readout.map((r) => {
              const cls = highlight === null ? "" : highlight === r.id ? "hl" : "dim";
              const mismatch = r.well_formed && r.data !== r.expected_data;
              return (
                <tr
                  key={r.id}
                  className={`pn-click ${cls}`}
                  title={highlight === r.id ? "Click to remove the highlight" : "Click to highlight this branch"}
                  onClick={() => setHighlight(highlight === r.id ? null : r.id)}
                >
                  <td className="mono">{branchLabel(r.id, inputs, labels)}</td>
                  <td className="mono">|{r.address}⟩</td>
                  <td className={`mono ${mismatch ? "pn-bad" : ""}`} title={mismatch ? "Differs from the stored data" : undefined}>
                    {r.data || "–"}
                  </td>
                  <td className="mono">{r.expected_data || "–"}</td>
                  <td className="mono">{r.prob.toFixed(4)}</td>
                  <td
                    className={r.well_formed ? "" : "pn-bad"}
                    data-testid={r.erased ? "readout-erased" : undefined}
                    title={
                      r.erased
                        ? `Not well formed: no walker in ${r.erased.join(", ")}: the loss is visible at the output (heralded)`
                        : r.well_formed
                          ? "Well formed"
                          : "Not well formed"
                    }
                  >
                    {r.well_formed ? "✓" : "✗"}
                    {r.erased ? ` no ${r.erased.join(", ")}` : ""}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {stateOmitted && stateOmitted.count > 0 && (
        <p className="muted pn-caption" data-testid="readout-omitted">
          {omittedText(stateOmitted)} (only the largest output branches are listed; the metrics use the full state).
        </p>
      )}
    </Panel>
  );
}
