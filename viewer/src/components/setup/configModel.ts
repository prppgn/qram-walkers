// Setup drawer model (DESIGN.md §4, §5 and §7.5; DECISIONS D9, D12, D27): pure helpers that turn
// the form state into a qramsim.run/1 configuration and back, plus previews of what the
// engine will do with it. No physics here: the engine merges duplicate addresses,
// normalises the input and simulates; these helpers only prepare and preview its input.
// Conventions follow engine/src/qramsim/config.py (`input_terms`, `fill_memory`,
// `normalised_terms`) and engine/src/qramsim/noise.py (`MODELS`, `parse_noise`).
import type { Amp, NoiseEntryJSON, RunConfigJSON } from "../../model/types";

/** Uniform random numbers in [0, 1); injectable so that tests are deterministic. */
export type Rng = () => number;

export const RUN_SCHEMA = "qramsim.run/1";
/** Sizes the viewer targets (D12); the engine accepts larger ones. */
export const N_RANGE = { min: 1, max: 6 } as const;
export const M_RANGE = { min: 1, max: 4 } as const;

// ---------------------------------------------------------------------------
// Variants and copy modes

export type Family = "bosonic" | "qudit" | "dualrail";

export interface VariantInfo {
  id: string;
  label: string;
  family: Family;
  enabled: boolean;
  /** Development phase in which a disabled variant arrives. */
  phase?: number;
  tip: string;
}

export const VARIANTS: readonly VariantInfo[] = [
  {
    id: "basic",
    label: "basic",
    family: "bosonic",
    enabled: true,
    tip: "Basic bosonic encoding: one walker per address bit (present = red R, absent = ∅)",
  },
  {
    id: "backup",
    label: "backup",
    family: "bosonic",
    enabled: true,
    tip: "Backup variant: every walker is followed by a red backup; short-range gates Û_in and Û_B on 4-site edges, pipelined across levels",
  },
  {
    id: "qudit_short",
    label: "qudit, short range",
    family: "qudit",
    enabled: true,
    tip: "Four-level qudits (○ = 0, ● = 1, colour R/B), always present: Û_in and a chain of Û_B on 2-site edges, colour-only scattering Ŝ_sr; no backups needed",
  },
  {
    id: "qudit_long",
    label: "qudit, long range",
    family: "qudit",
    enabled: true,
    tip: "Four-level qudits, always present: long-range Û⁽ᵈ⁾ = Û_○ ⊕ Û_● and the subspace-dependent Ŝ (dual-rail orientation)",
  },
  {
    id: "dualrail_basic",
    label: "dual-rail, basic",
    family: "dualrail",
    enabled: true,
    tip: "Two trees, ↑ = 0 and ↓ = 1: the basic protocol and its photographic negative; the cell output circuit moves the data that read 0 to the ↑ tree",
  },
  {
    id: "dualrail_backup",
    label: "dual-rail, backup",
    family: "dualrail",
    enabled: true,
    tip: "Two trees with a backup on each tree for every carrier, 3(n+m) walkers; each tree runs the backup protocol on 4-site edges",
  },
];


/** Copy modes the engine accepts per variant (engine `COPY_MODES`). */
const COPY_MODES: Record<string, readonly string[]> = {
  basic: ["global", "cell_switch"],
  backup: ["backup"],
  qudit_short: ["global", "cell_switch"],
  qudit_long: ["global", "cell_switch"],
  dualrail_basic: ["global", "cell_switch"],
  dualrail_backup: ["backup"],
};

export function variantInfo(id: string): VariantInfo | undefined {
  return VARIANTS.find((v) => v.id === id);
}

export function copyModesFor(variant: string): readonly string[] {
  return COPY_MODES[variant] ?? ["global", "cell_switch"];
}

// ---------------------------------------------------------------------------
// Draft types

export interface TermDraft {
  /** Address a_1 … a_n (a_1 = level 1, most significant). */
  bits: string;
  /** Relative modulus in [0, 1]; the engine normalises the superposition. */
  modulus: number;
  /** Phase in degrees, in [0, 360). */
  phaseDeg: number;
}

/** A fill rule the viewer cannot reproduce (the engine's seeded numpy RNG). */
export interface MemorySpec {
  fill: string;
  seed: number | null;
}

/** Explicit bits in cell order (`2^n` rows of `m` bits), or a fill rule for the engine. */
export type MemoryDraft = number[][] | MemorySpec;

export interface OptionsDraft {
  queryStagger: boolean;
  /** false skips the query phase (routing + inverse routing only). */
  query: boolean;
  strict: boolean;
  ghosts: boolean;
}

type EngineOptions = NonNullable<RunConfigJSON["options"]>;
type RecordOptions = NonNullable<RunConfigJSON["record"]>;

/** One noise channel of the form (one entry of the configuration's `noise` list). */
export interface NoiseDraft {
  /** Engine model name (`loss`, `bit_flip`, …). */
  model: string;
  /** Probability of the models with a single parameter (all but `clock_jitter`). */
  p: number;
  /** `clock_jitter`: probability that a gate instance fires one tick early. */
  pEarly: number;
  /** `clock_jitter`: probability that a gate instance fires one tick late. */
  pLate: number;
  /** `overrotation`: ε in [−1, 1], θ = επ/2. */
  epsilon: number;
  /** `beam_splitter_imbalance`: η in [−1, 1], φ = ηπ/2. */
  eta: number;
  /** Coherent errors: Gaussian spread of ε (per gate and edge) or η (per node), ≥ 0. */
  sigma: number;
  /** `beam_splitter_imbalance`: backward crossing = transpose (reciprocal, default, D31) or adjoint. */
  backward: BackwardMode;
  /** `overrotation`: empty targets also get the phase e^{−iθ} (off by default, D31). */
  vacuumPhase: boolean;
  /** What `depolarizing` acts on, on the qudit and dual-rail variants (D35). */
  on: DepolarizingOn;
  /** Locations (`propagation`, `gate`, `memory`, `scattering`, `idle`). */
  where: string[];
  /** Target groups (`all`, `address`, `data`, `backup`, `flag`) or slot names (`D_1`). */
  targets: string[];
  /** Phases in which the channel acts (`routing`, `query`, `inverse`). */
  phases: string[];
  /**
   * Gate types: edited for `overrotation` (chips U, U_in, U_B); for the other models a
   * restriction from a loaded configuration, passed through unedited.
   */
  gates?: string[];
}

export interface SetupDraft {
  variant: string;
  n: number;
  m: number;
  copyMode: string;
  terms: TermDraft[];
  memory: MemoryDraft;
  options: OptionsDraft;
  /** Noise channels; empty for the ideal run. */
  noise: NoiseDraft[];
  /** Run seed: the engine's RNG for noise sampling (numpy `default_rng(seed)`). */
  seed: number;
  /** Engine options not in `options` (n_sites, inverse_mode, prune_eps, …), passed through. */
  extraOptions: Omit<EngineOptions, "query_stagger" | "query" | "strict">;
  /** Record options the form does not edit (max_frame_branches), passed through. */
  extraRecord: Omit<RecordOptions, "frames" | "ghosts" | "frame_metrics">;
}

export function isMemorySpec(memory: MemoryDraft): memory is MemorySpec {
  return !Array.isArray(memory);
}

/** Initial form: preset E1 (n = 2, m = 1, address 10, b⁽¹⁰⁾ = 1). */
export function defaultDraft(): SetupDraft {
  return {
    variant: "basic",
    n: 2,
    m: 1,
    copyMode: "global",
    terms: [{ bits: "10", modulus: 1, phaseDeg: 0 }],
    memory: [[0], [0], [1], [0]],
    options: { queryStagger: true, query: true, strict: false, ghosts: true },
    noise: [],
    seed: 0,
    extraOptions: {},
    extraRecord: {},
  };
}

// ---------------------------------------------------------------------------
// Small numeric helpers

function round(x: number, digits: number): number {
  const f = 10 ** digits;
  return Math.round(x * f) / f;
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, Math.trunc(value)));
}

/** Angle wrapped into [0, 360). */
export function wrapDeg(deg: number): number {
  const w = ((deg % 360) + 360) % 360;
  return w === 360 ? 0 : w + 0; // `+ 0` turns −0 into 0
}

/** Phase snapped to a multiple of 45° (π/4), or rounded to a whole degree when free. */
export function snapPhase(deg: number, snap: boolean): number {
  const w = wrapDeg(deg);
  return wrapDeg(snap ? Math.round(w / 45) * 45 : Math.round(w));
}

/**
 * Angle of a dial pointer in degrees, counter-clockwise from the +x axis (complex-plane
 * convention), from its offset to the dial centre in screen coordinates (y down).
 */
export function dialAngle(dx: number, dy: number): number {
  if (dx === 0 && dy === 0) return 0;
  return wrapDeg((Math.atan2(-dy, dx) * 180) / Math.PI);
}

const S = Math.SQRT1_2;
const EIGHTHS: readonly Amp[] = [
  [1, 0],
  [S, S],
  [0, 1],
  [-S, S],
  [-1, 0],
  [-S, -S],
  [0, -1],
  [S, -S],
];

/** Complex amplitude r·e^{iφ} as [re, im]; exact at multiples of 45° so opposite phases cancel. */
export function amplitude(modulus: number, phaseDeg: number): Amp {
  const p = wrapDeg(phaseDeg);
  const q = p / 45;
  if (Number.isInteger(q)) {
    const [c, s] = EIGHTHS[q % 8]!;
    return [modulus * c + 0, modulus * s + 0];
  }
  const rad = (p * Math.PI) / 180;
  return [modulus * Math.cos(rad), modulus * Math.sin(rad)];
}

// ---------------------------------------------------------------------------
// Addresses

export function toBits(index: number, n: number): string {
  return index.toString(2).padStart(n, "0");
}

/** All `2^n` addresses in cell order (cell l = 1 + Σ a_i 2^(n−i)). */
export function allAddresses(n: number): string[] {
  return Array.from({ length: 1 << n }, (_, i) => toBits(i, n));
}

export function isAddress(bits: string, n: number): boolean {
  return bits.length === n && /^[01]*$/.test(bits);
}

/**
 * Address resized to `n` bits: new deepest bits a_{k+1} … a_n are 0 (the tree gains
 * levels below the existing ones); shrinking drops the deepest bits.
 */
export function resizeBits(bits: string, n: number): string {
  return bits.length >= n ? bits.slice(0, n) : bits.padEnd(n, "0");
}

export function toggleBit(bits: string, i: number): string {
  if (i < 0 || i >= bits.length) return bits;
  return bits.slice(0, i) + (bits[i] === "1" ? "0" : "1") + bits.slice(i + 1);
}

/** Terms resized to `n` bits (duplicates created by shrinking are kept; the engine merges them). */
export function resizeTerms(terms: TermDraft[], n: number): TermDraft[] {
  return terms.map((t) => ({ ...t, bits: resizeBits(t.bits, n) }));
}

/** Addresses used by more than one row, in cell order. */
export function duplicateAddresses(terms: TermDraft[]): string[] {
  const count = new Map<string, number>();
  for (const t of terms) count.set(t.bits, (count.get(t.bits) ?? 0) + 1);
  return [...count]
    .filter(([, c]) => c > 1)
    .map(([a]) => a)
    .sort((a, b) => parseInt(a, 2) - parseInt(b, 2));
}

/** First address (in cell order) not used by any row, or null when all `2^n` are used. */
export function firstUnusedAddress(terms: TermDraft[], n: number): string | null {
  const used = new Set(terms.map((t) => t.bits));
  for (let i = 0; i < 1 << n; i++) {
    const a = toBits(i, n);
    if (!used.has(a)) return a;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Normalised preview (mirrors the engine's `normalised_terms`)

export interface NormalisedTerm {
  address: string;
  re: number;
  im: number;
}

/**
 * The superposition the engine will run: duplicate addresses merged by summing their
 * complex amplitudes (first-appearance order), normalised, zero amplitudes dropped.
 * Empty when the norm is zero.
 */
export function normalise(terms: TermDraft[]): NormalisedTerm[] {
  const merged = new Map<string, Amp>();
  for (const t of terms) {
    const [re, im] = amplitude(t.modulus, t.phaseDeg);
    const acc = merged.get(t.bits) ?? [0, 0];
    merged.set(t.bits, [acc[0] + re, acc[1] + im]);
  }
  let norm2 = 0;
  for (const [re, im] of merged.values()) norm2 += re * re + im * im;
  const norm = Math.sqrt(norm2);
  if (!(norm > 0) || !Number.isFinite(norm)) return [];
  const out: NormalisedTerm[] = [];
  for (const [address, [re, im]] of merged) {
    if (Math.hypot(re, im) / norm < 1e-12) continue;
    out.push({ address, re: re / norm, im: im / norm });
  }
  return out;
}

/** Amplitude as "0.7071", "−0.7071" or "0.7071·e^{i90°}" (as in the ket panel). */
export function formatAmplitude(re: number, im: number): string {
  const rs = Math.hypot(re, im).toFixed(4);
  const ph = wrapDeg(Math.round(wrapDeg((Math.atan2(im, re) * 180) / Math.PI)));
  if (ph === 0) return rs;
  if (ph === 180) return `−${rs}`;
  return `${rs}·e^{i${ph}°}`;
}

/** Plain-text state, e.g. `0.7071 |00⟩ + 0.7071·e^{i90°} |11⟩`; "" for the zero vector. */
export function formatState(terms: NormalisedTerm[]): string {
  return terms
    .map((t, i) => {
      const amp = formatAmplitude(t.re, t.im);
      const ket = `|${t.address}⟩`;
      if (i === 0) return `${amp} ${ket}`;
      return amp.startsWith("−") ? ` − ${amp.slice(1)} ${ket}` : ` + ${amp} ${ket}`;
    })
    .join("");
}

// ---------------------------------------------------------------------------
// Input presets (engine `input_terms`)

export type InputPreset = "single" | "uniform" | "ghz" | "w" | "random";

/** Distinct random integers in [0, size), sorted (partial Fisher–Yates). */
function sample(size: number, k: number, rng: Rng): number[] {
  const pool = Array.from({ length: size }, (_, i) => i);
  for (let i = 0; i < k; i++) {
    const j = Math.min(size - 1, i + Math.floor(rng() * (size - i)));
    [pool[i], pool[j]] = [pool[j]!, pool[i]!];
  }
  return pool.slice(0, k).sort((a, b) => a - b);
}

/**
 * Terms of an input preset: `single` |0…0⟩, `uniform` (all 2^n addresses), `ghz`
 * |0…0⟩ + |1…1⟩, `w` (Hamming weight one), `random` (k distinct addresses with modulus
 * in [0.2, 1] rounded to 0.01 and a whole-degree phase). Moduli are relative: the
 * engine normalises.
 */
export function presetTerms(kind: InputPreset, n: number, rng: Rng, k = 3): TermDraft[] {
  const unit = (bits: string): TermDraft => ({ bits, modulus: 1, phaseDeg: 0 });
  switch (kind) {
    case "single":
      return [unit("0".repeat(n))];
    case "uniform":
      return allAddresses(n).map(unit);
    case "ghz":
      return [unit("0".repeat(n)), unit("1".repeat(n))];
    case "w":
      return Array.from({ length: n }, (_, i) => unit(toBits(1 << i, n)));
    case "random": {
      const size = 1 << n;
      return sample(size, clampInt(k, 1, size), rng).map((a) => ({
        bits: toBits(a, n),
        modulus: round(0.2 + 0.8 * rng(), 2),
        phaseDeg: wrapDeg(Math.floor(360 * rng())),
      }));
    }
  }
}

// ---------------------------------------------------------------------------
// Memory (engine `fill_memory`)

export type MemoryFill = "zeros" | "ones" | "random" | "identity";
export const MEMORY_FILLS: readonly MemoryFill[] = ["zeros", "ones", "random", "identity"];

/**
 * Memory filled by a rule. `identity` stores in cell a the m least significant bits of
 * a, zero-padded on the left when m > n (as the engine). `random` uses `rng` and is not
 * the engine's seeded fill.
 */
export function fillMemory(kind: MemoryFill, n: number, m: number, rng: Rng): number[][] {
  return Array.from({ length: 1 << n }, (_, a) => {
    switch (kind) {
      case "zeros":
        return new Array<number>(m).fill(0);
      case "ones":
        return new Array<number>(m).fill(1);
      case "random":
        return Array.from({ length: m }, () => (rng() < 0.5 ? 0 : 1));
      case "identity":
        return [...toBits(a % 2 ** m, m)].map(Number);
    }
  });
}

/**
 * Memory resized to `2^n` cells of `m` bits. Cell a′ takes the bits of the old cell on
 * the same tree path (its address resized with `resizeBits`), so growing `n` keeps the
 * data every address term reads; bits b_{k+1} … b_m added by growing `m` are 0. A fill
 * rule is returned unchanged (the engine regenerates it for the new sizes).
 */
export function resizeMemory(memory: MemoryDraft, n: number, m: number): MemoryDraft {
  if (isMemorySpec(memory)) return memory;
  const oldN = Math.round(Math.log2(Math.max(1, memory.length)));
  return allAddresses(n).map((a) => {
    const src = memory[parseInt(resizeBits(a, oldN), 2)] ?? [];
    return Array.from({ length: m }, (_, j) => (src[j] ? 1 : 0));
  });
}

/** Memory as text, one `address,bits` line per cell (the import format). */
export function formatMemoryText(bits: number[][], n: number): string {
  return bits.map((row, i) => `${toBits(i, n)},${row.join("")}`).join("\n");
}

/**
 * Parse memory text: one line per cell in cell order, each line `m` bits (`01`),
 * optionally prefixed by the cell address and a comma (`10,01`). Blank lines and `#`
 * comments are ignored, spaces inside a field are dropped.
 */
export function parseMemoryText(text: string, n: number, m: number): { bits: number[][] } | { error: string } {
  const cells = 1 << n;
  const rows: number[][] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!.replace(/#.*$/, "").trim();
    if (!line) continue;
    const where = `line ${i + 1}`;
    if (rows.length >= cells) return { error: `${where}: too many lines, the memory has 2^n = ${cells} cells` };
    const fields = line.split(/[,;\t]/).map((f) => f.replace(/\s+/g, ""));
    let bits: string;
    if (fields.length === 1) {
      bits = fields[0]!;
    } else if (fields.length === 2) {
      const [address, data] = fields as [string, string];
      const expected = toBits(rows.length, n);
      if (!isAddress(address, n)) return { error: `${where}: "${address}" is not an ${n}-bit address` };
      if (address !== expected) {
        return { error: `${where}: address ${address} out of order (expected ${expected}; lines follow the cell order)` };
      }
      bits = data;
    } else {
      return { error: `${where}: expected "bits" or "address,bits"` };
    }
    if (!isAddress(bits, m)) return { error: `${where}: "${bits}" is not ${m} bit${m > 1 ? "s" : ""} (0/1)` };
    rows.push([...bits].map(Number));
  }
  if (rows.length !== cells) return { error: `expected ${cells} lines (one per cell), found ${rows.length}` };
  return { bits: rows };
}

// ---------------------------------------------------------------------------
// Noise (engine `noise.MODELS` and `parse_noise`; DESIGN.md §4, DECISION D27)

export const NOISE_LOCATIONS = ["propagation", "gate", "memory", "scattering", "idle"] as const;
export const NOISE_TARGETS = ["all", "address", "data", "backup", "flag"] as const;
export const NOISE_PHASES = ["routing", "query", "inverse"] as const;

export type NoiseKind = "stochastic" | "classical" | "coherent";
export type NoiseParam = "p" | "p_early" | "p_late" | "epsilon" | "eta" | "sigma";
export type BackwardMode = "adjoint" | "reciprocal";
export type DepolarizingOn = "colour" | "logical" | "both";
export const DEPOLARIZING_ON: readonly DepolarizingOn[] = ["colour", "logical", "both"];
/** Gate types an over-rotation can act on (engine `X_GATE_TYPES`), in display order. */
export const X_GATE_TYPES = ["U", "U_in", "U_B"] as const;
export const BACKWARD_MODES: readonly BackwardMode[] = ["adjoint", "reciprocal"];

export interface NoiseModelInfo {
  /** Engine name. */
  name: string;
  /** Display name (as in the user guide). */
  label: string;
  /** One line, same meaning as `MODELS[name].description` in noise.py. */
  description: string;
  /**
   * Kraus channel with quantum jumps (state dependent), classical event shared by all
   * branches, or coherent (unitary) error that splits branches (DECISION D30).
   */
  kind: NoiseKind;
  /** Locations preselected for a new channel (engine `default_where`). */
  defaultWhere: readonly string[];
  /** Locations where the model can act; [] = none (the location is meaningless). */
  locations: readonly string[];
  /** The location is fixed by the model (`scatter_flip`, the coherent errors). */
  fixedWhere?: boolean;
  /** Parameters: probabilities, or the coherent error value and its spread `sigma`. */
  params: readonly NoiseParam[];
  /** The model honours the `phases` restriction (all but `memory_bit_flip`). */
  phased: boolean;
  /** Tooltip of each parameter field. */
  tips: Partial<Record<NoiseParam, string>>;
  /** User-guide anchor when it is not `noise-<name with - for _>`. */
  anchor?: string;
  /** Gate types the model acts on, edited as chips (`overrotation`: U, U_in, U_B). */
  gateTypes?: readonly string[];
  /** The model has the `vacuum_phase` switch (`overrotation`, D31). */
  vacuumPhase?: boolean;
  /** The model has the `backward` convention (`beam_splitter_imbalance`, D31). */
  backward?: boolean;
  /** Walker families the model exists on; all when absent (D35). */
  families?: readonly Family[];
  /** The model can act on colour, logical value or both (`depolarizing` on the new alphabets, D35). */
  on?: boolean;
}

const ALL_LOCATIONS: readonly string[] = NOISE_LOCATIONS;
const GATE_LOCATIONS: readonly string[] = ["gate", "memory"];

export const NOISE_MODELS: readonly NoiseModelInfo[] = [
  {
    name: "loss",
    label: "Loss",
    description: "the walker disappears (∅) with probability p",
    kind: "stochastic",
    defaultWhere: ["propagation"],
    locations: ALL_LOCATIONS,
    params: ["p"],
    phased: true,
    tips: { p: "Probability p that a present walker is lost (|R⟩, |B⟩ → |∅⟩) at each application" },
  },
  {
    name: "bit_flip",
    label: "Colour flip",
    description: "the colour flips (X̂: |R⟩ ↔ |B⟩) with probability p",
    kind: "stochastic",
    defaultWhere: ["gate"],
    locations: ALL_LOCATIONS,
    params: ["p"],
    phased: true,
    tips: { p: "Probability p of a colour flip X̂ at each application" },
  },
  {
    name: "colour_dephasing",
    label: "Colour dephasing",
    description: "phase flip between |R⟩ and |B⟩ (Ẑ) with probability p",
    kind: "stochastic",
    defaultWhere: ["propagation"],
    locations: ALL_LOCATIONS,
    params: ["p"],
    phased: true,
    tips: { p: "Probability p of a phase flip Ẑ = |R⟩⟨R| − |B⟩⟨B| + |∅⟩⟨∅| at each application" },
  },
  {
    name: "presence_dephasing",
    label: "Presence dephasing",
    description: "phase flip between present and ∅ (Ẑ′) with probability p",
    kind: "stochastic",
    defaultWhere: ["propagation"],
    locations: ALL_LOCATIONS,
    params: ["p"],
    phased: true,
    tips: { p: "Probability p of a phase flip Ẑ′ = |R⟩⟨R| + |B⟩⟨B| − |∅⟩⟨∅| at each application" },
    families: ["bosonic"],
  },
  {
    name: "logical_dephasing",
    label: "Logical dephasing",
    description: "phase flip of the logical value (○ or ↑; ∅ on the bosonic variants)",
    kind: "stochastic",
    defaultWhere: ["propagation"],
    locations: ALL_LOCATIONS,
    params: ["p"],
    phased: true,
    tips: { p: "Probability p of a phase flip Ẑᴸ with its sign on the logical 0 at each application" },
  },
  {
    name: "logical_flip",
    label: "Logical flip",
    description: "the logical value flips: ○ ↔ ● on a qudit, ↑ ↔ ↓ on dual-rail (the walker changes tree)",
    kind: "stochastic",
    defaultWhere: ["gate"],
    locations: ALL_LOCATIONS,
    params: ["p"],
    phased: true,
    tips: { p: "Probability p of a logical flip X̂ᴸ at each application" },
    families: ["qudit", "dualrail"],
  },
  {
    name: "depolarizing",
    label: "Depolarising",
    description: "depolarising channel on span{|R⟩, |B⟩} with probability p",
    kind: "stochastic",
    defaultWhere: ["gate"],
    locations: ALL_LOCATIONS,
    params: ["p"],
    phased: true,
    tips: { p: "Depolarising probability p: X̂, Ŷ, Ẑ each with probability p/4 at each application" },
    on: true,
  },
  {
    name: "scatter_flip",
    label: "Scatter flip",
    description: "colour flip right before a bifurcation: the walker takes the wrong branch",
    kind: "stochastic",
    defaultWhere: ["scattering"],
    locations: ["scattering"],
    fixedWhere: true,
    params: ["p"],
    phased: true,
    tips: { p: "Probability p that a walker about to cross a bifurcation flips colour (and takes the wrong branch)" },
  },
  {
    name: "gate_failure",
    label: "Gate failure",
    description: "a gate silently does not fire",
    kind: "classical",
    defaultWhere: ["gate", "memory"],
    locations: GATE_LOCATIONS,
    params: ["p"],
    phased: true,
    tips: { p: "Probability p that a gate does not fire, drawn per firing and edge (lane); all branches see the same draw" },
  },
  {
    name: "clock_jitter",
    label: "Clock jitter",
    description: "a gate fires one tick early or late",
    kind: "classical",
    defaultWhere: ["gate", "memory"],
    locations: GATE_LOCATIONS,
    params: ["p_early", "p_late"],
    phased: true,
    tips: {
      p_early: "Probability that each scheduled gate instance fires one tick early (drawn once per instance and run)",
      p_late: "Probability that each scheduled gate instance fires one tick late (drawn once per instance and run)",
    },
  },
  {
    name: "copy_error",
    label: "Copy error",
    description: "a copy reads the stored bit inverted",
    kind: "classical",
    defaultWhere: ["memory"],
    locations: ["memory"],
    params: ["p"],
    phased: true,
    tips: { p: "Probability p that a copy reads the stored bit inverted, drawn per copy instance and lane" },
  },
  {
    name: "memory_bit_flip",
    label: "Memory bit flip",
    description: "stored bits flipped before the run",
    kind: "classical",
    defaultWhere: [],
    locations: [],
    params: ["p"],
    phased: false,
    tips: {
      p: "Probability p that each stored bit is flipped at initialisation (fidelity is measured against the intended memory)",
    },
  },
  {
    name: "overrotation",
    label: "Over-rotation",
    description: "coherent over-rotation of every colour flip: X̂ → cos θ X̂ − i sin θ Î, θ = επ/2",
    kind: "coherent",
    defaultWhere: ["gate"],
    locations: ["gate"],
    fixedWhere: true,
    params: ["epsilon", "sigma"],
    phased: true,
    tips: {
      epsilon:
        "Over-rotation ε in [−1, 1]: every colour flip X̂ of an active controlled gate becomes cos θ X̂ − i sin θ Î with θ = επ/2 (typical values 0–0.1)",
      sigma:
        "Spread σ ≥ 0: each gate and edge gets its own ε drawn from a Gaussian N(ε, σ), once per run (used by the forward and the inverse firing)",
    },
    gateTypes: X_GATE_TYPES,
    vacuumPhase: true,
  },
  {
    name: "beam_splitter_imbalance",
    label: "Beam-splitter imbalance",
    description: "coherent mixing of the two output ports of every bifurcation, φ = ηπ/2",
    kind: "coherent",
    defaultWhere: ["scattering"],
    locations: ["scattering"],
    fixedWhere: true,
    params: ["eta", "sigma"],
    phased: true,
    tips: {
      eta: "Imbalance η in [−1, 1]: after Ŝ the two output ports are mixed by [[cos φ, i sin φ], [i sin φ, cos φ]] with φ = ηπ/2",
      sigma: "Spread σ ≥ 0: each bifurcation node gets its own η drawn from a Gaussian N(η, σ), once per run",
    },
    anchor: "noise-imbalance",
    backward: true,
  },
];

/** Probability of a new channel: small but visible in a single run. */
export const NOISE_DEFAULT_P = 0.01;
/** ε or η of a new coherent channel (θ = φ = 4.5°). */
export const NOISE_DEFAULT_COHERENT = 0.05;

export function noiseModel(name: string): NoiseModelInfo | undefined {
  return NOISE_MODELS.find((m) => m.name === name);
}

/** Models that exist on a variant's walker family (D35). */
export function modelsFor(variant: string): readonly NoiseModelInfo[] {
  const family = variantInfo(variant)?.family ?? "bosonic";
  return NOISE_MODELS.filter((m) => !m.families || m.families.includes(family));
}

/** User-guide anchor of a model: `noise-bit-flip` for `bit_flip`, `noise-imbalance`, … */
export function noiseAnchor(model: string): string {
  return noiseModel(model)?.anchor ?? `noise-${model.replace(/_/g, "-")}`;
}

/** Allowed range of a parameter (engine validation): probabilities in [0, 1], ε, η in [−1, 1], σ ≥ 0. */
export function paramRange(param: NoiseParam): { min: number; max: number } {
  if (param === "epsilon" || param === "eta") return { min: -1, max: 1 };
  if (param === "sigma") return { min: 0, max: Number.POSITIVE_INFINITY };
  return { min: 0, max: 1 };
}

/** Draft field holding a parameter. */
export const PARAM_KEY = {
  p: "p",
  p_early: "pEarly",
  p_late: "pLate",
  epsilon: "epsilon",
  eta: "eta",
  sigma: "sigma",
} as const satisfies Record<NoiseParam, keyof NoiseDraft>;

export function paramValue(d: NoiseDraft, param: NoiseParam): number {
  return d[PARAM_KEY[param]];
}

/** A new channel of `model` with the engine's default locations, all targets, gates and phases. */
export function defaultNoise(model: string): NoiseDraft {
  const info = noiseModel(model);
  const has = (param: NoiseParam) => info?.params.includes(param) ?? false;
  const draft: NoiseDraft = {
    model,
    p: has("p") || !info ? NOISE_DEFAULT_P : 0,
    pEarly: has("p_early") ? NOISE_DEFAULT_P : 0,
    pLate: has("p_late") ? NOISE_DEFAULT_P : 0,
    epsilon: has("epsilon") ? NOISE_DEFAULT_COHERENT : 0,
    eta: has("eta") ? NOISE_DEFAULT_COHERENT : 0,
    sigma: 0,
    backward: "reciprocal",
    vacuumPhase: false,
    on: "colour",
    where: [...(info?.defaultWhere ?? [])],
    targets: ["all"],
    phases: [...NOISE_PHASES],
  };
  if (info?.gateTypes) draft.gates = [...info.gateTypes];
  return draft;
}

/** Any coherent channel (they split branches: pruning applies). */
export function hasCoherent(noise: readonly NoiseDraft[]): boolean {
  return noise.some((d) => noiseModel(d.model)?.kind === "coherent");
}

/** Gate types of `gates` that do not exist in `variant` (basic: Û⁽ᵈ⁾ only; backup: Û_in, Û_B). */
export function absentGateTypes(gates: readonly string[], variant: string): string[] {
  const absent: Record<string, readonly string[]> = {
    basic: ["U_in", "U_B"],
    backup: ["U"],
    qudit_short: ["U"],
    qudit_long: ["U_in", "U_B"],
    dualrail_basic: ["U_in", "U_B"],
    dualrail_backup: ["U"],
  };
  return gates.filter((g) => (absent[variant] ?? []).includes(g));
}

/** `list` without duplicates, the names of `order` first in that order, the others after in their order. */
function canonical(list: readonly string[], order: readonly string[]): string[] {
  const set = new Set(list);
  return [...order.filter((x) => set.has(x)), ...[...set].filter((x) => !order.includes(x))];
}

/** `list` with `item` toggled, in the canonical `order`. */
export function toggleListItem(list: readonly string[], item: string, order: readonly string[]): string[] {
  return canonical(list.includes(item) ? list.filter((x) => x !== item) : [...list, item], order);
}

/** Targets with `all` exclusive (it already contains every slot), groups in canonical order. */
export function normaliseTargets(targets: readonly string[]): string[] {
  return targets.includes("all") ? ["all"] : canonical(targets, NOISE_TARGETS);
}

/** Target chip toggle: `all` replaces every other choice, any other choice replaces `all`. */
export function toggleTarget(targets: readonly string[], name: string): string[] {
  if (targets.includes(name)) return targets.filter((t) => t !== name);
  if (name === "all") return ["all"];
  return canonical([...targets.filter((t) => t !== "all"), name], NOISE_TARGETS);
}

function asList(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  return (Array.isArray(value) ? value : [value]).map(String);
}

function asNumber(value: unknown): number {
  if (value === undefined || value === null) return 0;
  const v = Number(value);
  return Number.isNaN(v) ? 0 : v;
}

/**
 * Noise entry of the run configuration. Explicit: always the model and its probability
 * field(s), `where` for models with a location (the fixed one for `scatter_flip`),
 * `targets` for the stochastic channels, `phases` for the models that honour them.
 */
export function noiseEntryFromDraft(d: NoiseDraft): NoiseEntryJSON {
  const info = noiseModel(d.model);
  const entry: NoiseEntryJSON = { model: d.model };
  for (const param of info?.params ?? ["p"]) entry[param] = paramValue(d, param);
  if (!info || info.locations.length) {
    entry.where = info?.fixedWhere ? [...info.defaultWhere] : canonical(d.where, NOISE_LOCATIONS);
  }
  if (!info || info.kind === "stochastic") entry.targets = normaliseTargets(d.targets);
  if (!info || info.phased) entry.phases = canonical(d.phases, NOISE_PHASES);
  if (info?.gateTypes) entry.gates = canonical(d.gates ?? info.gateTypes, info.gateTypes);
  else if (d.gates) entry.gates = [...d.gates];
  if (info?.vacuumPhase) entry.vacuum_phase = d.vacuumPhase;
  if (info?.backward) entry.backward = d.backward;
  if (info?.on && d.on !== "colour") entry.on = d.on;
  return entry;
}

/** Form state of a noise entry, with the engine's defaults for the missing fields. */
export function noiseDraftFromEntry(entry: NoiseEntryJSON): NoiseDraft {
  const model = String(entry.model ?? "");
  const info = noiseModel(model);
  const defaults = [...(info?.defaultWhere ?? [])];
  const where = info?.fixedWhere ? defaults : (asList(entry.where) ?? defaults);
  const draft: NoiseDraft = {
    model,
    p: asNumber(entry.p),
    pEarly: asNumber(entry.p_early),
    pLate: asNumber(entry.p_late),
    epsilon: asNumber(entry.epsilon),
    eta: asNumber(entry.eta),
    sigma: asNumber(entry.sigma),
    backward: String(entry.backward ?? "reciprocal") as BackwardMode,
    vacuumPhase: entry.vacuum_phase === undefined || entry.vacuum_phase === null ? false : Boolean(entry.vacuum_phase),
    on: entry.on ?? "colour",
    where: canonical(where, NOISE_LOCATIONS),
    targets: normaliseTargets(asList(entry.targets) ?? ["all"]),
    phases: canonical(asList(entry.phases) ?? [...NOISE_PHASES], NOISE_PHASES),
  };
  const gates = asList(entry.gates) ?? (info?.gateTypes ? [...info.gateTypes] : undefined);
  if (gates) draft.gates = info?.gateTypes ? canonical(gates, info.gateTypes) : gates;
  return draft;
}

/** Target groups that contain no slot in a variant (engine `train.py`). */
const ABSENT_TARGETS: Record<string, readonly string[]> = {
  basic: ["backup"],
  backup: ["flag"],
  qudit_short: ["backup"],
  qudit_long: ["backup"],
  dualrail_basic: ["backup"],
  dualrail_backup: ["flag"],
};

/** Target groups of `targets` that are empty in `variant`. */
export function absentTargets(targets: readonly string[], variant: string): string[] {
  const absent = ABSENT_TARGETS[variant] ?? [];
  return targets.filter((t) => absent.includes(t));
}

/**
 * Problems of one channel; `index` is 0-based (messages count from 1). With `variant`,
 * also warns when every target group is empty in that variant.
 */
export function noiseChannelIssues(d: NoiseDraft, index: number, variant?: string): DraftIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  const name = `Noise channel ${index + 1} (${d.model || "no model"})`;
  const info = noiseModel(d.model);
  if (!info) {
    errors.push(`${name}: unknown model; choose one of ${NOISE_MODELS.map((m) => m.name).join(", ")}.`);
    return { errors, warnings };
  }
  const family = variant === undefined ? undefined : (variantInfo(variant)?.family ?? "bosonic");
  if (family && info.families && !info.families.includes(family)) {
    errors.push(
      d.model === "presence_dephasing"
        ? `${name}: the walkers of the ${variant} variant are always present; use logical dephasing.`
        : `${name}: on the ${variant} variant the logical value is the presence of a walker: this error does not exist.`,
    );
  }
  if (family === "bosonic" && d.on !== "colour") {
    errors.push(`${name}: on = ${d.on} exists only on the qudit and dual-rail variants.`);
  }
  if (family && family !== "bosonic" && info.vacuumPhase && d.vacuumPhase) {
    errors.push(`${name}: the vacuum phase exists only on the bosonic variants, where a gate target can be empty.`);
  }
  for (const param of info.params) {
    const v = paramValue(d, param);
    const { min, max } = paramRange(param);
    if (Number.isFinite(v) && v >= min && v <= max) continue;
    errors.push(
      param === "sigma"
        ? `${name}: sigma = ${v} must be a non-negative number.`
        : `${name}: ${param} = ${v} is outside [${min < 0 ? `−${-min}` : min}, ${max}].`,
    );
  }
  if (info.params.includes("p_early") && d.pEarly + d.pLate > 1 + 1e-12) {
    errors.push(`${name}: p_early + p_late = ${round(d.pEarly + d.pLate, 6)} exceeds 1.`);
  }
  if (info.locations.length && !info.fixedWhere) {
    const unknown = d.where.filter((w) => !(ALL_LOCATIONS as readonly string[]).includes(w));
    if (unknown.length) errors.push(`${name}: unknown location ${unknown.join(", ")}.`);
    if (d.where.length === 0) errors.push(`${name} has no location: choose where it acts.`);
    const idle = d.where.filter((w) => ALL_LOCATIONS.includes(w) && !info.locations.includes(w));
    if (idle.length) {
      warnings.push(
        `${name} acts only at ${info.locations.join(" and ")}: the location${idle.length > 1 ? "s" : ""} ${idle.join(", ")} ha${idle.length > 1 ? "ve" : "s"} no effect.`,
      );
    }
  }
  if (info.kind === "stochastic" && d.targets.length === 0) {
    errors.push(`${name} has no target: choose which slots it acts on.`);
  }
  if (info.kind === "stochastic" && variant !== undefined && d.targets.length > 0) {
    const absent = absentTargets(d.targets, variant);
    if (absent.length === d.targets.length) {
      warnings.push(`${name} targets no slot: the ${variant} variant has no ${absent.join(" or ")} walkers.`);
    }
  }
  if (info.gateTypes) {
    const gates = d.gates ?? [];
    if (gates.length === 0) errors.push(`${name} acts on no gate type: choose at least one.`);
    const absent = variant === undefined ? [] : absentGateTypes(gates, variant);
    if (gates.length > 0 && absent.length === gates.length) {
      warnings.push(`${name} acts on no gate: the ${variant} variant has no ${absent.join(" or ")} gates.`);
    }
  }
  if (info.backward && !BACKWARD_MODES.includes(d.backward)) {
    errors.push(`${name}: backward = ${d.backward} must be ${BACKWARD_MODES.join(" or ")}.`);
  }
  if (info.phased) {
    const unknown = d.phases.filter((ph) => !(NOISE_PHASES as readonly string[]).includes(ph));
    if (unknown.length) errors.push(`${name}: unknown phase ${unknown.join(", ")}.`);
    if (d.phases.length === 0) errors.push(`${name} acts in no phase: choose at least one.`);
  }
  if (info.params.every((param) => paramValue(d, param) === 0)) {
    const which = info.params.length > 1 ? info.params.join(" = ") : info.params[0]!;
    warnings.push(`${name} has ${which} = 0: it has no effect.`);
  }
  return { errors, warnings };
}

/** Problems of all channels, in channel order. */
export function noiseIssues(noise: readonly NoiseDraft[], variant?: string): DraftIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  noise.forEach((d, i) => {
    const r = noiseChannelIssues(d, i, variant);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
  });
  return { errors, warnings };
}

/** Round values of each decade the probability slider steps through. */
const PROB_MANTISSAS = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8] as const;
const PROB_DECADES = 4;
/**
 * Positions of the probability slider: 0 is p = 0, then round values on a log scale from
 * 10⁻⁴ (position 1) to 0.8, and p = 1 at the end. The number field takes any value.
 */
export const PROB_SLIDER_MAX = PROB_DECADES * PROB_MANTISSAS.length + 1;
/** Smallest non-zero probability of the slider. */
export const PROB_SLIDER_MIN = 10 ** -PROB_DECADES;

/** Probability at a slider position (0, 1e-4, 1.2e-4, 1.5e-4, …, 0.8, 1). */
export function sliderToProb(step: number): number {
  const s = Math.round(step);
  if (!(s > 0)) return 0;
  if (s >= PROB_SLIDER_MAX) return 1;
  const i = s - 1;
  const mantissa = PROB_MANTISSAS[i % PROB_MANTISSAS.length]!;
  const decade = Math.floor(i / PROB_MANTISSAS.length) - PROB_DECADES;
  return Number((mantissa * 10 ** decade).toPrecision(2));
}

/** Slider position nearest to a probability on the log scale; p > 0 never maps to the p = 0 end. */
export function probToSlider(p: number): number {
  if (!(p > 0)) return 0;
  if (p >= 1) return PROB_SLIDER_MAX;
  const target = Math.log10(p);
  let best = 1;
  for (let s = 2; s <= PROB_SLIDER_MAX; s++) {
    if (Math.abs(Math.log10(sliderToProb(s)) - target) < Math.abs(Math.log10(sliderToProb(best)) - target)) best = s;
  }
  return best;
}

/** Seeds drawn by "re-roll": integers in [0, SEED_MAX). */
export const SEED_MAX = 1_000_000;

/** A random run seed, different from `previous`. */
export function randomSeed(rng: Rng, previous?: number): number {
  const s = Math.min(SEED_MAX - 1, Math.floor(rng() * SEED_MAX));
  return s === previous ? (s + 1) % SEED_MAX : s;
}

export function isValidSeed(seed: number): boolean {
  return Number.isSafeInteger(seed) && seed >= 0;
}

// ---------------------------------------------------------------------------
// Pruning of coherent branches (engine `Options.prune_eps`, `Options.max_branches`; D30)

export const PRUNE_EPS_DEFAULT = 1e-10;
export const MAX_BRANCHES_DEFAULT = 2048;

/** Effective pruning settings of a draft (the engine defaults when the form left them unset). */
export function pruning(draft: Pick<SetupDraft, "extraOptions">): { pruneEps: number; maxBranches: number } {
  return {
    pruneEps: draft.extraOptions.prune_eps ?? PRUNE_EPS_DEFAULT,
    maxBranches: draft.extraOptions.max_branches ?? MAX_BRANCHES_DEFAULT,
  };
}

/** Errors of the pruning options (only those set in the draft are checked). */
export function pruningIssues(draft: Pick<SetupDraft, "extraOptions">): string[] {
  const errors: string[] = [];
  const { prune_eps, max_branches } = draft.extraOptions;
  if (prune_eps !== undefined && !(Number.isFinite(prune_eps) && prune_eps >= 0 && prune_eps < 1)) {
    errors.push(`prune_eps = ${prune_eps} must be in [0, 1) (branches with |α|² below it are dropped).`);
  }
  if (max_branches !== undefined && !(Number.isSafeInteger(max_branches) && max_branches >= 1)) {
    errors.push(`max_branches = ${max_branches} must be a positive integer.`);
  }
  return errors;
}

// ---------------------------------------------------------------------------
// Draft edits

/** Draft with a new `n` (clamped to the viewer range), terms and memory resized. */
export function withN(draft: SetupDraft, n: number): SetupDraft {
  const nn = clampInt(n, N_RANGE.min, N_RANGE.max);
  if (nn === draft.n) return draft;
  return { ...draft, n: nn, terms: resizeTerms(draft.terms, nn), memory: resizeMemory(draft.memory, nn, draft.m) };
}

/** Draft with a new `m` (clamped to the viewer range), memory rows resized. */
export function withM(draft: SetupDraft, m: number): SetupDraft {
  const mm = clampInt(m, M_RANGE.min, M_RANGE.max);
  if (mm === draft.m) return draft;
  return { ...draft, m: mm, memory: resizeMemory(draft.memory, draft.n, mm) };
}

export interface DraftIssues {
  /** Problems that prevent running. */
  errors: string[];
  /** Things the engine handles but the user should know. */
  warnings: string[];
}

/** Issues of the input superposition alone (shown under the address editor). */
export function termIssues(terms: TermDraft[], n: number): DraftIssues {
  const errors: string[] = [];
  const warnings: string[] = [];
  const bad = terms.filter((t) => !isAddress(t.bits, n));
  if (bad.length) errors.push(`Invalid address ${bad[0]!.bits}: addresses have n = ${n} bits.`);
  if (terms.length === 0) errors.push("Add at least one address term.");
  else if (normalise(terms).length === 0) {
    errors.push("All moduli are 0: the state has zero norm and cannot be run.");
  }
  const dup = duplicateAddresses(terms);
  if (dup.length) {
    warnings.push(
      `Several rows share the address ${dup.map((a) => `|${a}⟩`).join(", ")}: the engine merges them by adding their amplitudes.`,
    );
  }
  return { errors, warnings };
}

/** Everything that blocks a run (errors) or deserves a note (warnings). */
export function draftIssues(draft: SetupDraft): DraftIssues {
  const errors: string[] = [];
  if (!variantInfo(draft.variant)?.enabled) errors.push(`The ${draft.variant} variant is not available yet.`);
  if (!copyModesFor(draft.variant).includes(draft.copyMode)) {
    errors.push(`Copy mode ${draft.copyMode} is not valid for the ${draft.variant} variant.`);
  }
  const terms = termIssues(draft.terms, draft.n);
  const noise = noiseIssues(draft.noise, draft.variant);
  if (!isValidSeed(draft.seed)) errors.push(`The seed must be a non-negative integer (got ${draft.seed}).`);
  errors.push(...pruningIssues(draft));
  return {
    errors: [...errors, ...terms.errors, ...noise.errors],
    warnings: [...terms.warnings, ...noise.warnings],
  };
}

// ---------------------------------------------------------------------------
// RunConfig ⇄ draft

function toAmp(value: unknown): Amp {
  if (Array.isArray(value)) return [Number(value[0]) || 0, Number(value[1]) || 0];
  return [Number(value) || 0, 0];
}

/**
 * Form state from a run configuration. Moduli are rescaled to fit [0, 1] (only ratios
 * matter) and rounded to 4 decimals, phases to 0.01°. Memory given as a deterministic
 * fill becomes explicit bits; a `random` fill (the engine's numpy RNG) stays a rule.
 */
export function draftFromConfig(cfg: RunConfigJSON): SetupDraft {
  const n = Math.max(1, Math.trunc(cfg.n || 1));
  const m = Math.max(1, Math.trunc(cfg.m || 1));
  const amps = (cfg.input?.terms ?? []).map((t) => toAmp(t.amp));
  const mods = amps.map(([re, im]) => Math.hypot(re, im));
  const scale = Math.max(1, ...mods);
  const terms = (cfg.input?.terms ?? []).map((t, i) => ({
    bits: resizeBits(String(t.address).replace(/[^01]/g, ""), n),
    modulus: round(mods[i]! / scale, 4),
    phaseDeg: wrapDeg(round((Math.atan2(amps[i]![1], amps[i]![0]) * 180) / Math.PI, 2)),
  }));

  let memory: MemoryDraft;
  const mem = cfg.memory as Partial<{ bits: number[][]; fill: string; seed: number | null }> | undefined;
  if (mem?.bits) {
    memory = resizeMemory(
      mem.bits.map((row) => row.map((b) => (b ? 1 : 0))),
      n,
      m,
    );
  } else {
    const fill = mem?.fill ?? "zeros";
    memory =
      fill === "random" || !(MEMORY_FILLS as readonly string[]).includes(fill)
        ? { fill, seed: mem?.seed ?? null }
        : fillMemory(fill as MemoryFill, n, m, () => 0);
  }

  const { query_stagger, query, strict, ...extraOptions }: EngineOptions = cfg.options ?? {};
  const { frames, ghosts, frame_metrics, ...extraRecord }: RecordOptions = cfg.record ?? {};
  return {
    variant: cfg.variant || "basic",
    n,
    m,
    copyMode: cfg.copy_mode || "global",
    terms,
    memory,
    options: {
      queryStagger: query_stagger ?? true,
      query: query ?? true,
      strict: strict ?? false,
      ghosts: ghosts ?? true,
    },
    noise: (cfg.noise ?? []).map(noiseDraftFromEntry),
    seed: cfg.seed ?? 0,
    extraOptions,
    extraRecord,
  };
}

/**
 * Run configuration from the form. Amplitudes are sent un-normalised (the engine
 * normalises and merges duplicates); rows with modulus 0 are left out.
 */
export function configFromDraft(draft: SetupDraft): RunConfigJSON {
  const memory = isMemorySpec(draft.memory)
    ? { fill: draft.memory.fill, seed: draft.memory.seed }
    : { bits: draft.memory.map((row) => [...row]) };
  return {
    schema: RUN_SCHEMA,
    variant: draft.variant,
    n: draft.n,
    m: draft.m,
    copy_mode: draft.copyMode,
    options: {
      ...draft.extraOptions,
      query_stagger: draft.options.queryStagger,
      query: draft.options.query,
      strict: draft.options.strict,
    },
    input: {
      terms: draft.terms
        .filter((t) => t.modulus > 0)
        .map((t) => ({ address: t.bits, amp: amplitude(t.modulus, t.phaseDeg) })),
    },
    memory,
    noise: draft.noise.map(noiseEntryFromDraft),
    seed: draft.seed,
    record: { ...draft.extraRecord, frames: true, ghosts: draft.options.ghosts, frame_metrics: false },
  };
}
