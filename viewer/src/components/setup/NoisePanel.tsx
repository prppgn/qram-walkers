// NoisePanel (DESIGN.md §4 and §7.5, DECISIONS D27, D30): the noise channels of the run
// as cards (model, parameters, locations, targets, gates, phases), plus the run seed. The
// engine samples one quantum-jump trajectory per run and expands coherent errors into
// branches; the viewer only edits the configuration.
import { useState, type ReactNode } from "react";
import { InfoButton } from "../Panel";
import {
  absentGateTypes,
  absentTargets,
  BACKWARD_MODES,
  defaultNoise,
  hasCoherent,
  NOISE_LOCATIONS,
  DEPOLARIZING_ON,
  modelsFor,
  NOISE_MODELS,
  variantInfo,
  type DepolarizingOn,
  NOISE_PHASES,
  NOISE_TARGETS,
  noiseAnchor,
  noiseChannelIssues,
  noiseModel,
  paramRange,
  paramValue,
  PARAM_KEY,
  PROB_SLIDER_MAX,
  PROB_SLIDER_MIN,
  probToSlider,
  randomSeed,
  sliderToProb,
  toggleListItem,
  toggleTarget,
  type BackwardMode,
  type NoiseDraft,
  type NoiseModelInfo,
  type NoiseParam,
} from "./configModel";

const LOCATION_TIPS: Record<string, string> = {
  propagation: "propagation: after every move (routing and inverse routing), on every slot inside the tree",
  gate: "gate: after a tree gate (Û⁽ᵈ⁾, Û_in, Û_B) fires, on the slots in its window, on every edge of its level",
  memory: "memory: after a lane gate (copy, cell switch) fires, on the slots in its window",
  scattering: "scattering: before every move, on the slots about to cross a bifurcation (Ŝ or Ŝ†)",
  idle: "idle: at every query tick, on every slot",
};

/** Classical models act on gate firings, not on slots. */
const GATE_LOCATION_TIPS: Record<string, string> = {
  gate: "gate: the tree gates Û⁽ᵈ⁾, Û_in and Û_B",
  memory: "memory: the lane gates (copies, cell switches and the clocked X̂_c of dual-rail cells)",
};

const TARGET_TIPS: Record<string, string> = {
  all: "all: every slot of the train (choosing it clears the groups below)",
  address: "address: the address walkers A₁ … Aₙ",
  data: "data: the data walkers D₁ … Dₘ",
  backup: "backup: the backup walkers Ãᵢ and D̃ⱼ (backup variants)",
  flag: "flag: the flag walker D₀ and the delimiter D_{m+1} (not in the backup variants)",
};

const PHASE_TIPS: Record<string, string> = {
  routing: "routing: the address walkers are steered into the tree and the data walkers reach the memory cells",
  query: "query: the copies at the memory cells",
  inverse: "inverse: inverse routing, the exact time reversal of routing that brings the train back out",
};

const GATE_TIPS: Record<string, string> = {
  U: "U: the address-transmission gates Û⁽ᵈ⁾ (long-range variants)",
  U_in: "U_in: the initialisation gates Û_in (short-range variants)",
  U_B: "U_B: the block gates Û_B (short-range variants)",
};

/** Why the location of a model is fixed. */
const FIXED_WHERE_TIPS: Record<string, string> = {
  scatter_flip: "always acts at scattering, right before a bifurcation",
  overrotation: "always acts at the tree gates that flip colours (choose them under gates)",
  beam_splitter_imbalance: "always acts at scattering, on the two output ports of every bifurcation",
};

/** Slider of a parameter: log scale for probabilities, a fine linear range otherwise. */
type SliderSpec = "log" | { min: number; max: number; step: number };

const PARAM_INFO: Record<NoiseParam, { label: string; slider: SliderSpec; testId: string; angle?: string }> = {
  p: { label: "p", slider: "log", testId: "noise-p" },
  p_early: { label: "p_early", slider: "log", testId: "noise-p-early" },
  p_late: { label: "p_late", slider: "log", testId: "noise-p-late" },
  epsilon: { label: "ε", slider: { min: -0.2, max: 0.2, step: 0.001 }, testId: "noise-epsilon", angle: "θ" },
  eta: { label: "η", slider: { min: -0.2, max: 0.2, step: 0.001 }, testId: "noise-eta", angle: "φ" },
  sigma: { label: "σ", slider: { min: 0, max: 0.1, step: 0.001 }, testId: "noise-sigma" },
};

const BACKWARD_TIPS: Record<BackwardMode, string> = {
  adjoint:
    "adjoint: the backward crossing is Ŝ† M†, so a walker that retraces its path undoes the mixing exactly",
  reciprocal:
    "reciprocal (default): the backward crossing is the transpose Ŝ† M (a physical reciprocal device), so the mixing does not cancel",
};

const fmtRange = (min: number, max: number) =>
  `[${min < 0 ? `−${-min}` : min}, ${Number.isFinite(max) ? max : "∞"})`.replace(/\)$/, Number.isFinite(max) ? "]" : ")");

function locationTip(info: NoiseModelInfo, loc: string): string {
  if (info.fixedWhere) return `${info.label} ${FIXED_WHERE_TIPS[info.name] ?? `always acts at ${info.defaultWhere.join(", ")}`} (fixed by the model)`;
  if (!info.locations.includes(loc)) {
    return `${info.label} acts only at ${info.locations.join(" and ")}: ${loc} has no effect for this model`;
  }
  const tip = info.kind === "classical" ? GATE_LOCATION_TIPS[loc] : LOCATION_TIPS[loc];
  return `${tip ?? loc} (click to toggle)`;
}

const KIND_TIPS: Record<NoiseModelInfo["kind"], string> = {
  stochastic: "Kraus channel sampled with quantum jumps (state dependent)",
  classical: "Classical error: one draw shared by all branches",
  coherent: "Coherent (unitary) error: it splits branches instead of sampling a jump",
};

function Chip(props: {
  label: string;
  on: boolean;
  tip: string;
  testId: string;
  disabled?: boolean;
  dim?: boolean;
  onToggle: () => void;
}) {
  return (
    <label
      className={`chip noise-chip${props.on ? " on" : ""}${props.disabled ? " disabled" : ""}${props.dim ? " dim" : ""}`}
      title={props.tip}
    >
      <input
        type="checkbox"
        checked={props.on}
        disabled={props.disabled}
        data-testid={props.testId}
        onChange={props.onToggle}
      />
      {props.label}
    </label>
  );
}

function ChipRow(props: { label: string; tip: string; info?: ReactNode; children: ReactNode }) {
  return (
    <div className="noise-chips" role="group" aria-label={props.label}>
      <span className="noise-row-label muted" title={props.tip}>
        {props.label}
        {props.info}
      </span>
      {props.children}
    </div>
  );
}

function ParamField(props: {
  param: NoiseParam;
  value: number;
  tip: string;
  index: number;
  onChange: (v: number) => void;
}) {
  const { param, value, index } = props;
  const { label, slider, testId, angle } = PARAM_INFO[param];
  const { min, max } = paramRange(param);
  const range = fmtRange(min, max);
  const sliderTip =
    slider === "log"
      ? `Logarithmic slider from ${PROB_SLIDER_MIN} to 1 (far left = 0)`
      : `Fine slider on ${fmtRange(slider.min, slider.max)}`;
  return (
    <div className="noise-prob">
      <span className="noise-row-label muted mono" title={props.tip}>
        {label}
      </span>
      <input
        type="range"
        className="noise-range"
        min={slider === "log" ? 0 : slider.min}
        max={slider === "log" ? PROB_SLIDER_MAX : slider.max}
        step={slider === "log" ? 1 : slider.step}
        value={slider === "log" ? probToSlider(value) : value}
        aria-label={`${label} slider of noise channel ${index + 1}`}
        aria-valuetext={`${label} = ${value}`}
        title={`${props.tip}. ${sliderTip}; type any value in ${range} in the box`}
        onChange={(e) => {
          const v = Number(e.target.value);
          props.onChange(slider === "log" ? sliderToProb(v) : v);
        }}
      />
      <input
        type="number"
        min={min}
        max={Number.isFinite(max) ? max : undefined}
        step="any"
        value={value}
        data-testid={testId}
        aria-label={`${label} of noise channel ${index + 1}`}
        title={`${props.tip} (any value in ${range})`}
        onChange={(e) => {
          const v = Number.parseFloat(e.target.value);
          if (Number.isFinite(v)) props.onChange(v);
        }}
      />
      {angle && (
        <span className="noise-angle muted" title={`${angle} = ${label}·π/2 in degrees`}>
          {angle} = {Number((value * 90).toFixed(2))}°
        </span>
      )}
    </div>
  );
}

function NoiseCard(props: {
  channel: NoiseDraft;
  index: number;
  variant: string;
  onChange: (d: NoiseDraft) => void;
  onRemove: () => void;
}) {
  const { channel: d, index, variant } = props;
  const info = noiseModel(d.model);
  const family = variantInfo(variant)?.family ?? "bosonic";
  const set = (patch: Partial<NoiseDraft>) => props.onChange({ ...d, ...patch });
  const { errors, warnings } = noiseChannelIssues(d, index, variant);
  const absent = absentTargets([...NOISE_TARGETS], variant);
  const extraTargets = d.targets.filter((t) => !(NOISE_TARGETS as readonly string[]).includes(t));
  const gateTypes = info?.gateTypes;
  const gates = d.gates ?? [];
  const extraGates = gateTypes ? gates.filter((g) => !gateTypes.includes(g)) : [];
  const absentGates = absentGateTypes([...(gateTypes ?? [])], variant);

  return (
    <div className="noise-card" data-testid="noise-card" data-model={d.model}>
      <div className="noise-card-head">
        <strong>{info?.label ?? d.model}</strong>
        <span className="mono muted">{d.model}</span>
        {info && <InfoButton anchor={noiseAnchor(d.model)} topic={`the ${info.label.toLowerCase()} channel`} />}
        {info && (
          <span
            className="badge"
            title={KIND_TIPS[info.kind]}
          >
            {info.kind}
          </span>
        )}
        <button
          type="button"
          className="btn icon noise-remove"
          data-testid="noise-remove"
          aria-label={`Remove noise channel ${index + 1} (${d.model})`}
          title="Remove this noise channel"
          onClick={props.onRemove}
        >
          ✕
        </button>
      </div>
      {info && <div className="noise-desc muted">{info.description}</div>}

      {info?.params.map((param) => (
        <ParamField
          key={param}
          param={param}
          value={paramValue(d, param)}
          tip={info.tips[param] ?? param}
          index={index}
          onChange={(v) => set({ [PARAM_KEY[param]]: v } as Partial<NoiseDraft>)}
        />
      ))}

      {info?.on && family !== "bosonic" && (
        <label
          className="field noise-option"
          title="What the channel acts on: the colour qubit (default), the logical value, or both as one four-level system (15 Pauli errors, p/16 each)"
        >
          <span className="noise-row-label muted">acts on</span>
          <select
            value={d.on}
            data-testid="noise-on"
            title="colour, logical value, or both"
            onChange={(e) => set({ on: e.target.value as DepolarizingOn })}
          >
            {DEPOLARIZING_ON.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      {info?.vacuumPhase && family === "bosonic" && (
        <label
          className="field setup-check noise-option"
          title="Off (default): only the colour of a present walker is over-rotated. On: the literal formula cos θ X̂ − i sin θ Î, with X̂ the identity on ∅, also gives an empty target site the phase e^(−iθ)"
        >
          <input
            type="checkbox"
            checked={d.vacuumPhase}
            data-testid="noise-vacuum"
            onChange={(e) => set({ vacuumPhase: e.target.checked })}
          />
          <span>
            vacuum phase e<sup>−iθ</sup> on empty targets
          </span>
        </label>
      )}

      {info?.backward && (
        <label
          className="field noise-option"
          title="How a walker crosses an imbalanced bifurcation backward: reciprocal (default) or adjoint"
        >
          <span className="noise-row-label muted">backward</span>
          <select
            value={d.backward}
            data-testid="noise-backward"
            title={BACKWARD_TIPS[d.backward] ?? d.backward}
            onChange={(e) => set({ backward: e.target.value as BackwardMode })}
          >
            {BACKWARD_MODES.map((m) => (
              <option key={m} value={m} title={BACKWARD_TIPS[m]}>
                {m}
              </option>
            ))}
          </select>
        </label>
      )}

      {info && info.locations.length > 0 && (
        <ChipRow
          label="where"
          tip="Locations where the channel acts"
          info={<InfoButton anchor="noise-locations" topic="noise locations" />}
        >
          {NOISE_LOCATIONS.map((loc) => {
            const on = d.where.includes(loc);
            const relevant = info.locations.includes(loc);
            return (
              <Chip
                key={loc}
                label={loc}
                on={on}
                tip={locationTip(info, loc)}
                testId={`noise-where-${loc}`}
                disabled={info.fixedWhere || (!relevant && !on)}
                onToggle={() => set({ where: toggleListItem(d.where, loc, NOISE_LOCATIONS) })}
              />
            );
          })}
        </ChipRow>
      )}

      {(!info || info.kind === "stochastic") && (
        <ChipRow
          label="targets"
          tip="Slots the channel acts on"
          info={<InfoButton anchor="noise-targets" topic="noise targets" />}
        >
          {NOISE_TARGETS.map((t) => (
            <Chip
              key={t}
              label={t}
              on={d.targets.includes(t)}
              tip={absent.includes(t) ? `${TARGET_TIPS[t]}: the ${variant} variant has none` : (TARGET_TIPS[t] ?? t)}
              testId={`noise-target-${t}`}
              dim={absent.includes(t)}
              onToggle={() => set({ targets: toggleTarget(d.targets, t) })}
            />
          ))}
          {extraTargets.map((t) => (
            <Chip
              key={t}
              label={t}
              on
              tip={`Slot ${t}, from the loaded configuration: click to remove it`}
              testId={`noise-target-${t}`}
              onToggle={() => set({ targets: toggleTarget(d.targets, t) })}
            />
          ))}
        </ChipRow>
      )}

      {gateTypes && (
        <ChipRow label="gates" tip="Gate types whose colour flips are over-rotated">
          {gateTypes.map((g) => (
            <Chip
              key={g}
              label={g}
              on={gates.includes(g)}
              tip={
                absentGates.includes(g)
                  ? `${GATE_TIPS[g] ?? g}: the ${variant} variant has none`
                  : `${GATE_TIPS[g] ?? g} (click to toggle)`
              }
              testId={`noise-gate-${g}`}
              dim={absentGates.includes(g)}
              onToggle={() => set({ gates: toggleListItem(gates, g, gateTypes) })}
            />
          ))}
          {extraGates.map((g) => (
            <Chip
              key={g}
              label={g}
              on
              tip={`Gate type ${g}, from the loaded configuration: click to remove it`}
              testId={`noise-gate-${g}`}
              onToggle={() => set({ gates: toggleListItem(gates, g, gateTypes) })}
            />
          ))}
        </ChipRow>
      )}

      {(!info || info.phased) && (
        <ChipRow label="phases" tip="Protocol phases in which the channel acts">
          {NOISE_PHASES.map((ph) => (
            <Chip
              key={ph}
              label={ph}
              on={d.phases.includes(ph)}
              tip={`${PHASE_TIPS[ph]} (click to toggle)`}
              testId={`noise-phase-${ph}`}
              onToggle={() => set({ phases: toggleListItem(d.phases, ph, NOISE_PHASES) })}
            />
          ))}
        </ChipRow>
      )}

      {d.gates && !gateTypes && (
        <div className="noise-desc muted" title="Gate-type restriction from the loaded configuration (kept as it is)">
          only at gates of type <span className="mono">{d.gates.join(", ")}</span>
        </div>
      )}

      {[...errors, ...warnings].map((w) => (
        <div key={w} className="setup-warning" role="status" data-testid="noise-warning">
          {w}
        </div>
      ))}
    </div>
  );
}

export function NoisePanel(props: {
  noise: NoiseDraft[];
  variant: string;
  /** Effective `options.prune_eps` and `options.max_branches` (shown in the pruning note). */
  pruneEps: number;
  maxBranches: number;
  onChange: (noise: NoiseDraft[]) => void;
}) {
  const { noise, variant, onChange } = props;
  const models = modelsFor(variant);
  const [picked, setModel] = useState<string>(NOISE_MODELS[0]!.name);
  const model = models.some((m) => m.name === picked) ? picked : models[0]!.name;
  const chosen = noiseModel(model);

  return (
    <div className="noise-panel" data-testid="noise-panel">
      {noise.length === 0 ? (
        <div className="setup-note" data-testid="noise-ideal">
          Ideal run (no noise).
        </div>
      ) : (
        noise.map((d, i) => (
          <NoiseCard
            key={i}
            channel={d}
            index={i}
            variant={variant}
            onChange={(nd) => onChange(noise.map((x, j) => (j === i ? nd : x)))}
            onRemove={() => onChange(noise.filter((_, j) => j !== i))}
          />
        ))
      )}

      {hasCoherent(noise) && (
        <div className="setup-note noise-pruning" data-testid="noise-pruning">
          <span>
            Coherent errors split branches: every over-rotated flip or imbalanced bifurcation adds a second term.
            Branches with |α|² below <span className="mono">prune_eps</span> = {props.pruneEps} are dropped, and at most{" "}
            <span className="mono">max_branches</span> = {props.maxBranches} are kept (set both under Options). The
            dropped weight is reported as <em>discarded</em> and never renormalised.
          </span>
          <InfoButton anchor="noise-pruning" topic="pruning and discarded weight" />
        </div>
      )}

      <div className="setup-row">
        <select
          value={model}
          data-testid="noise-add-model"
          aria-label="Noise model to add"
          title={chosen ? `${chosen.label}: ${chosen.description}` : "Noise model to add"}
          onChange={(e) => setModel(e.target.value)}
        >
          {models.map((m) => (
            <option key={m.name} value={m.name} title={m.description}>
              {m.label} ({m.name})
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn"
          data-testid="noise-add"
          title="Add a channel of the chosen model, with its default locations, all targets and all phases (several channels combine)"
          onClick={() => onChange([...noise, defaultNoise(model)])}
        >
          + Add channel
        </button>
      </div>
    </div>
  );
}

/** Run seed with a re-roll button (the engine's RNG for every noise draw). */
export function SeedField(props: { seed: number; onChange: (seed: number) => void }) {
  return (
    <div className="noise-seed">
      <div className="setup-note">
        Each run samples the noise with the seed below (quantum-jump trajectories); use the Metrics panel&apos;s
        ensemble mode for averages.
        <InfoButton anchor="noise-ensembles" topic="ensembles and sweeps" />
      </div>
      <div className="setup-row">
        <label className="field" title="Seed of the engine's random number generator: the same seed and configuration give the same noisy trajectory">
          <span>Seed</span>
          <input
            type="number"
            min={0}
            step={1}
            value={props.seed}
            data-testid="noise-seed"
            onChange={(e) => {
              const v = Number.parseInt(e.target.value, 10);
              if (Number.isFinite(v)) props.onChange(Math.max(0, v));
            }}
          />
        </label>
        <button
          type="button"
          className="btn"
          data-testid="noise-reroll"
          title="Draw a new random seed: the next run samples a different noisy trajectory"
          onClick={() => props.onChange(randomSeed(Math.random, props.seed))}
        >
          ⟳ Re-roll
        </button>
      </div>
    </div>
  );
}
