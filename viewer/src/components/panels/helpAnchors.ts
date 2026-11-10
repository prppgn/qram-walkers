// Pure helpers of the information panels (DESIGN.md §7.5): user-guide anchors for
// events, event-table rows and filters, number formatting, the resources comparison
// table. Everything here formats data that the engine recorded in the trajectory; no
// physics is computed (D1).
import type { EventJSON, FrameJSON, MetaJSON, NoiseEntryJSON, NoiseMetaJSON, Trajectory } from "../../model/types";

// ---------------------------------------------------------------- help anchors

const GATE_ANCHORS: Record<string, string> = {
  U: "gate-U",
  copy_global: "gate-copy-global",
  cell_on: "gate-cell-on",
  copy_cell: "gate-copy-cell",
  cell_off: "gate-cell-off",
  U_in: "gate-U-in",
  U_B: "gate-U-B",
  copy_backup: "gate-copy-backup",
};

/** Per-variant anchors where the qudit / dual-rail gates differ from the bosonic ones. */
const VARIANT_GATE_ANCHORS: Record<string, Record<string, string>> = {
  qudit_long: { U: "gate-qudit-U", copy_global: "gate-qudit-copy", copy_cell: "gate-qudit-copy" },
  qudit_short: {
    U_in: "gate-qudit-short",
    U_B: "gate-qudit-short",
    copy_global: "gate-qudit-copy",
    copy_cell: "gate-qudit-copy",
  },
  dualrail_basic: { U: "gate-dr-U", copy_global: "gate-dr-copy", copy_cell: "gate-dr-copy" },
  dualrail_backup: { U_in: "gate-dr-backup", U_B: "gate-dr-backup", copy_backup: "gate-dr-backup" },
};

const SCATTER_ANCHORS: Record<string, string> = {
  qudit_long: "gate-qudit-S",
  qudit_short: "gate-qudit-short",
  dualrail_basic: "gate-dr-S",
  dualrail_backup: "gate-dr-S",
};

/** Guide anchor of a gate type in a variant. */
export function gateAnchor(type: string, variant?: string): string {
  if (type === "S_M" || type === "S_M_dag" || type === "X_c") return "gate-dr-out";
  return (variant && VARIANT_GATE_ANCHORS[variant]?.[type]) ?? GATE_ANCHORS[type] ?? "summary";
}

const PHASE_ANCHORS: Record<string, string> = {
  routing: "routing",
  query: "query",
  inverse: "inverse",
  done: "phases",
};

const NOISE_ANCHORS: Record<string, string> = {
  beam_splitter_imbalance: "noise-imbalance",
  prune: "noise-pruning",
};

/** Guide anchor of a noise model: "bit_flip" → "noise-bit-flip"; the imbalance and the
 *  pruning events have short anchors ("noise-imbalance", "noise-pruning"). */
export function noiseAnchor(model: string): string {
  return NOISE_ANCHORS[model] ?? `noise-${model.replace(/_/g, "-")}`;
}

/** Events that exist only off the ideal path: noise jumps and classical errors, strays
 *  (D21), collisions (D26), walkers absorbed at a lane end (P7). */
export function isNoiseEvent(e: EventJSON): boolean {
  return e.kind === "noise" || e.kind === "stray" || e.kind === "collision" || e.kind === "absorb";
}

/** User-guide anchor that explains an event ("Explain" buttons of the narration); the
 *  variant selects the qudit / dual-rail sections for their own gates. */
export function anchorForEvent(e: EventJSON, variant?: string): string {
  switch (e.kind) {
    case "noise":
      return noiseAnchor(e.model);
    case "stray":
      return "noise-strays";
    case "collision":
      return "noise-collisions";
    case "absorb":
      return "noise-absorb";
    case "gate":
      return gateAnchor(e.type, variant);
    case "scatter":
      if (variant && SCATTER_ANCHORS[variant]) return SCATTER_ANCHORS[variant]!;
      return e.dir === "fwd" ? "gate-S" : "gate-S-dag";
    case "phase":
      return PHASE_ANCHORS[e.phase] ?? "phases";
    case "turn":
      return "inverse";
    case "inject":
    case "exit":
      return "train";
    default:
      return "phases";
  }
}

/** Short badge text of an event: gate / Ŝ / Ŝ† / Ŝ† bounce / inject / exit / phase / turn /
 *  noise / stray / collision / absorb. */
export function eventKindLabel(e: EventJSON): string {
  switch (e.kind) {
    case "scatter":
      return e.dir === "fwd" ? "Ŝ" : e.dir === "bwd" ? "Ŝ†" : "Ŝ† bounce";
    default:
      return e.kind;
  }
}

const KIND_TITLES: Record<string, string> = {
  gate: "A gate instance fired on the clock",
  scatter: "A walker crossed a bifurcation (Ŝ forward, Ŝ† on the way back)",
  inject: "A walker entered the tree through the input port",
  exit: "A walker left the tree through the port",
  phase: "A phase of the protocol begins or ends",
  turn: "The walkers reverse their direction",
  noise:
    "Noise: a quantum jump of a noise channel, a classical error (gate failure, copy error, memory flip), a coherent error that splits branches (over-rotation, imbalance) or pruning of tiny branches",
  stray: "A copy on an empty site created a spurious walker outside the train",
  collision: "Two walkers met on one site: the branch is frozen and counts as a failure",
  absorb: "A walker ran past the end of its memory lane and left the system",
};

/** Tooltip of an event's kind badge; noise events name their model. */
export function eventKindTitle(e: EventJSON): string {
  const base = KIND_TITLES[e.kind] ?? e.kind;
  return e.kind === "noise" ? `${base}. Model: ${e.model.replace(/_/g, " ")}` : base;
}

/** Gate instance whose control was absent in every branch (it fired as the identity). */
export function isIdleGate(e: EventJSON): boolean {
  return e.kind === "gate" && e.fired_in.length === 0;
}

/** Branch ids an event involves (gates: where the control was present; classical noise
 *  events such as gate failures and memory flips involve every branch and list none). */
export function eventBranches(e: EventJSON): number[] {
  switch (e.kind) {
    case "gate":
      return e.fired_in;
    case "scatter":
      return [...new Set(e.crossings.map((c) => c.b))].sort((a, b) => a - b);
    case "inject":
    case "exit":
    case "absorb":
      return e.branches;
    case "noise":
      return e.branches ?? [];
    case "stray":
    case "collision":
      return [e.b];
    default:
      return [];
  }
}

/** Gate id of an event tied to a gate instance ("U1", "copy_D1", …): gate events, gate
 *  failures and copy errors, strays created by a copy. Empty for other events. */
export function eventGateId(e: EventJSON): string {
  switch (e.kind) {
    case "gate":
    case "stray":
      return e.gate;
    case "noise":
      return e.gate ?? "";
    default:
      return "";
  }
}

// ---------------------------------------------------------------- event table

export interface EventRow {
  /** Index into `traj.frames` (frame i = end of tick i − 1). */
  frame: number;
  t: number;
  phase: string;
  /** Position of the event inside its frame. */
  index: number;
  event: EventJSON;
}

/** Every event of the trajectory, in frame order, with the frame it belongs to. */
export function flattenEvents(traj: Trajectory): EventRow[] {
  const rows: EventRow[] = [];
  traj.frames.forEach((f, frame) => {
    f.events.forEach((event, index) => rows.push({ frame, t: f.t, phase: f.phase, index, event }));
  });
  return rows;
}

export type KindFilter = "all" | "gate" | "scatter" | "port" | "phase" | "noise";

export interface EventFilter {
  kind: KindFilter;
  /** Hide gate instances whose control was absent in every branch. */
  actedOnly: boolean;
  /** Case-insensitive substring over text, gate id, kind, phase and tick. */
  search: string;
}

export const DEFAULT_FILTER: EventFilter = { kind: "all", actedOnly: false, search: "" };

function kindMatches(e: EventJSON, kind: KindFilter): boolean {
  switch (kind) {
    case "all":
      return true;
    case "gate":
      return e.kind === "gate";
    case "scatter":
      return e.kind === "scatter";
    case "port":
      return e.kind === "inject" || e.kind === "exit";
    case "phase":
      return e.kind === "phase" || e.kind === "turn";
    case "noise":
      return isNoiseEvent(e);
  }
}

function haystack(r: EventRow): string {
  const e = r.event;
  const model = e.kind === "noise" ? e.model : "";
  return [e.text, eventGateId(e), eventKindLabel(e), e.kind, model, r.phase, `t${r.t}`, `tick ${r.t}`]
    .join(" ")
    .toLowerCase();
}

export function filterEvents(rows: EventRow[], filter: EventFilter): EventRow[] {
  const q = filter.search.trim().toLowerCase();
  return rows.filter(
    (r) =>
      kindMatches(r.event, filter.kind) &&
      !(filter.actedOnly && isIdleGate(r.event)) &&
      (q === "" || haystack(r).includes(q)),
  );
}

// ---------------------------------------------------------------- frame status

const PHASE_NAMES: Record<string, string> = {
  init: "Input",
  routing: "Routing",
  query: "Query",
  inverse: "Inverse routing",
  done: "Done",
};

export function phaseName(phase: string): string {
  return PHASE_NAMES[phase] ?? phase;
}

/** "tick 5 / 22 · routing", or the input state for frame 0. */
export function tickLabel(traj: Trajectory, frame: number): string {
  const f = traj.frames[frame];
  if (!f) return "";
  const last = traj.meta.phases.T_total - 1;
  if (f.t < 0) return `before tick 0 / ${last} · input`;
  return `tick ${f.t} / ${last} · ${f.phase}`;
}

/** Ids of the branches of a frame frozen by a collision (DECISION D26). */
export function collidedBranches(f: FrameJSON | undefined): number[] {
  return f ? f.branches.filter((b) => b.collided).map((b) => b.id) : [];
}

function anyWalkerOnPortLine(f: FrameJSON, dir: 1 | -1): boolean {
  return f.branches.some((b) =>
    b.walkers.some((w) => w.s !== "E" && w.pos?.[0] === 0 && (w.dir ?? 1) === dir),
  );
}

function anyWalkerInTree(f: FrameJSON): boolean {
  return f.branches.some((b) => b.walkers.some((w) => w.s !== "E" && (w.pos?.[0] ?? 0) > 0));
}

/** What happens in a frame without recorded events (read from positions, not computed). */
export function quietFrameText(traj: Trajectory, frame: number): string {
  const f = traj.frames[frame];
  if (!f) return "";
  if (f.t < 0) {
    return "Input state: the train waits on the port line, front slot first. Step or play to start the routing.";
  }
  if (f.phase === "query") {
    return "Every walker is at rest in the memory lanes; no gate acts in this tick.";
  }
  if (f.phase === "routing") {
    const queue = anyWalkerOnPortLine(f, 1) ? " Slots still queued on the port line advance toward the input port." : "";
    return `No gate fires and no walker meets a bifurcation: the walkers move one site forward along their edges.${queue}`;
  }
  if (f.phase === "inverse") {
    if (!anyWalkerInTree(f)) return "Every walker has left the tree through the port.";
    return "No gate fires and no walker meets a bifurcation: the walkers move one site back toward the port (tail first).";
  }
  return "The walkers move one site.";
}

// ---------------------------------------------------------------- numbers

const MINUS = "−";

/** 2.2e-16 → "2.2e−16" (typographic minus). */
export function formatExp(x: number, digits = 1): string {
  return x.toExponential(digits).replace("e+", "e").replace("-", MINUS);
}

/**
 * Numbers that should be exactly 1 (fidelity, success, norm): "1" when exact,
 * "1 − 2.2e−16" / "1 + 2.2e−16" when within 1e−4 of 1, otherwise 6 decimals. Rounding
 * at the last ulp stays visible, as the Eq. (1) gate demands exact fidelity.
 */
export function formatNearOne(x: number): string {
  if (!Number.isFinite(x)) return String(x);
  if (x === 1) return "1";
  const d = x - 1;
  if (Math.abs(d) < 1e-4) return `1 ${d < 0 ? MINUS : "+"} ${formatExp(Math.abs(d))}`;
  return x.toFixed(6);
}

/** Probabilities and expected counts: 4 decimals, tiny rounding noise shown as 0/1-exact. */
export function formatNumber(x: number, digits = 4): string {
  if (!Number.isFinite(x)) return String(x);
  if (Number.isInteger(x)) return String(x);
  return x.toFixed(digits);
}

/**
 * Ensemble estimate "mean ± standard error" with the error rounded to two significant
 * digits and the mean to the same decimal place: 0.8234, 0.0123 → "0.823 ± 0.012".
 * A zero error (every run gave the same value) prints the mean as formatNumber does.
 */
export function formatEstimate(mean: number, sem: number): string {
  if (!Number.isFinite(mean) || !Number.isFinite(sem)) return `${mean} ± ${sem}`;
  const clean = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x);
  const m = clean(mean);
  const e = clean(Math.abs(sem));
  if (e === 0) return `${formatNumber(m)} ± 0`;
  const digits = Math.max(0, Math.min(8, 1 - Math.floor(Math.log10(e))));
  return `${m.toFixed(digits)} ± ${e.toFixed(digits)}`.replace(/-/g, MINUS);
}

/** Parameter as in the configuration (probabilities, ε, η, σ): 0.01 → "0.01", 1e-5 →
 *  "1e−5", −0.02 → "−0.02". */
export function formatProb(p: number): string {
  return String(Number(p.toPrecision(4))).replace("e-", `e${MINUS}`).replace(/^-/, MINUS);
}

/** Probability weights that may be tiny (discarded, omitted): "0", "1.2e−5", "0.0276". */
export function formatWeight(w: number): string {
  if (!Number.isFinite(w)) return String(w);
  if (w === 0) return "0";
  if (Math.abs(w) < 1e-3) return formatExp(w, 1);
  return w.toFixed(4);
}

/** "5 more branches with total weight 0.0276 are not stored in this trajectory". */
export function omittedText(o: { count: number; weight: number }): string {
  const many = o.count !== 1;
  return `${o.count} more branch${many ? "es" : ""} with total weight ${formatWeight(o.weight)} ${
    many ? "are" : "is"
  } not stored in this trajectory`;
}

/** Segments of a formula string with ^x / _x / ^{…} / _{…} turned into sup/sub. */
export interface FormulaPart {
  t: "text" | "sup" | "sub";
  v: string;
}

export function formulaParts(s: string): FormulaPart[] {
  const parts: FormulaPart[] = [];
  const push = (t: FormulaPart["t"], v: string) => {
    if (!v) return;
    const last = parts[parts.length - 1];
    if (last && last.t === t) last.v += v;
    else parts.push({ t, v });
  };
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if ((c === "^" || c === "_") && i + 1 < s.length) {
      const t = c === "^" ? "sup" : "sub";
      if (s[i + 1] === "{") {
        const end = s.indexOf("}", i + 2);
        if (end > 0) {
          push(t, s.slice(i + 2, end));
          i = end + 1;
          continue;
        }
      }
      const m = /^[A-Za-z0-9′']+/.exec(s.slice(i + 1));
      if (m) {
        push(t, m[0]);
        i += 1 + m[0].length;
        continue;
      }
    }
    push("text", c);
    i += 1;
  }
  return parts;
}

// ---------------------------------------------------------------- resources

interface PaperResources {
  source?: string;
  walkers_max?: number;
  walkers_formula?: string;
  gates?: number;
  gates_formula?: string;
  n_sites_per_level?: number[];
  n_sites_formula?: string;
  sites_path?: number;
  sites_path_formula?: string;
  depth?: string;
}

type PerPhase<T> = Record<string, Record<string, T>>;

/** Shape of `final.resources` (engine/src/qramsim/resources.py). */
export interface EngineResources {
  K?: number;
  levels?: number;
  walkers_input?: { max: number; expected: number };
  gate_instances?: PerPhase<number>;
  gate_locations?: {
    U?: number;
    U_in?: number;
    U_B?: number;
    S: number;
    /** 2 for dual-rail (counts include both trees). */
    trees?: number;
    copy_per_cell: Record<string, number>;
    output_circuit_per_cell?: Record<string, number>;
    cells: number;
  };
  activations?: PerPhase<number>;
  activations_expected?: PerPhase<number>;
  S_crossings_expected?: Record<string, number>;
  S_bounces_expected?: number;
  sites_per_level?: number[];
  sites_path?: number;
  sites_path_tree_only?: number;
  sites_total?: number;
  T_fwd?: number;
  T_q?: number;
  T_total?: number;
  max_instances_per_tick?: number;
  max_gate_ops_per_tick?: number;
  paper?: PaperResources;
  notes?: string[];
}

export interface ResourceRow {
  id: string;
  label: string;
  /** Tooltip explaining the row. */
  title: string;
  engine: string;
  /** Value from the paper's formula, or "" when the paper gives none. */
  paper: string;
  /** The paper's closed formula (rendered with sup/sub). */
  formula?: string;
  /** Help anchor for an ⓘ next to the row. */
  help?: string;
}

const GATE_TYPE_NAMES: Record<string, string> = {
  U: "Û⁽ᵈ⁾",
  U_in: "Û_in",
  U_B: "Û_B",
  S: "Ŝ",
  copy_global: "Û_copy⁽ᵃ⁾",
  cell_on: "Û_on",
  copy_cell: "Û_copy(F)",
  cell_off: "Û_off",
  copy_backup: "Û_copy",
  S_M: "Ŝ_M",
  S_M_dag: "Ŝ_M†",
  X_c: "X̂_c",
};

/** "7 Û_in + 7 Û_B + 7 Ŝ = 21" from the engine's gate locations (tree gates only). */
export function gateLocationText(loc: NonNullable<EngineResources["gate_locations"]>): string {
  const parts = (["U", "U_in", "U_B", "S"] as const)
    .filter((t) => typeof loc[t] === "number")
    .map((t) => [t, loc[t] as number] as const);
  const total = parts.reduce((a, [, c]) => a + c, 0);
  const trees = loc.trees && loc.trees > 1 ? ` (${loc.trees} trees)` : "";
  return `${parts.map(([t, c]) => `${c} ${gateTypeName(t)}`).join(" + ")} = ${total}${trees}`;
}

/** The comparison of the six variants (technical paper, Table resource_comparison), with the
 *  engine's measured total depth in the lane model (DECISION D3; qramsim scaling). */
export interface ComparisonRow {
  variant: string;
  label: string;
  carriers: string;
  trees: number;
  gates: string;
  path: string;
  depth: string;
  engine: string;
}

export const VARIANT_COMPARISON: readonly ComparisonRow[] = [
  { variant: "basic", label: "Basic, long range", carriers: "≤ n + m", trees: 1, gates: "2(2ⁿ − 1)", path: "n²/2 + nm + O(n)", depth: "n²/2 + nm + O(n + m)", engine: "n² + 2nm + 5n + 3m + 2" },
  { variant: "backup", label: "Basic, short range (backup)", carriers: "≤ 2(n + m)", trees: 1, gates: "3(2ⁿ − 1)", path: "4n", depth: "10n + 4m", engine: "12n + 5m" },
  { variant: "dualrail_basic", label: "Dual-rail, long range", carriers: "n + m", trees: 2, gates: "4(2ⁿ − 1)", path: "n²/2 + nm + O(n)", depth: "n²/2 + nm + O(n + m)", engine: "n² + 2nm + 5n + 3m + 5" },
  { variant: "dualrail_backup", label: "Dual-rail, short range", carriers: "3(n + m)", trees: 2, gates: "6(2ⁿ − 1)", path: "4n", depth: "13n + 7m", engine: "12n + 5m + 3" },
  { variant: "qudit_long", label: "Qudit, long range", carriers: "n + m", trees: 1, gates: "2(2ⁿ − 1)", path: "n²/2 + nm + O(n)", depth: "n²/2 + nm + O(n + m)", engine: "n² + 2nm + 5n + 3m + 2" },
  { variant: "qudit_short", label: "Qudit, short range", carriers: "n + m", trees: 1, gates: "3(2ⁿ − 1)", path: "2n", depth: "5n + 2m", engine: "6n + 3m + 2" },
];

export function gateTypeName(type: string): string {
  return GATE_TYPE_NAMES[type] ?? type;
}

function plural(n: number, word: string): string {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function perPhaseText(counts: PerPhase<number> | undefined, expected?: PerPhase<number>): string {
  if (!counts) return "—";
  const parts: string[] = [];
  for (const [phase, byType] of Object.entries(counts)) {
    const items = Object.entries(byType).map(([type, c]) => {
      const ex = expected?.[phase]?.[type];
      const exText = ex !== undefined && Math.abs(ex - c) > 1e-9 ? ` (⟨·⟩ ${formatNumber(ex, 2)})` : "";
      return `${gateTypeName(type)} ${c}${exText}`;
    });
    parts.push(`${phase}: ${items.join(", ") || "—"}`);
  }
  return parts.join(" · ") || "—";
}

/** Rows of the "this run (engine)" vs "paper formula" table. */
export function resourceRows(res: EngineResources, meta: Pick<MetaJSON, "n" | "m">): ResourceRow[] {
  const p = res.paper ?? {};
  const levels = res.sites_per_level ?? [];
  const tree = levels.slice(0, meta.n);
  const lane = levels[meta.n];
  const loc = res.gate_locations;
  const rows: ResourceRow[] = [
    {
      id: "levels",
      label: "Tree levels n",
      title: "Levels of the binary tree (one per address bit); the memory lanes form level n + 1.",
      engine: res.levels !== undefined ? String(res.levels) : "—",
      paper: "",
    },
    {
      id: "K",
      label: "Train slots K",
      title: "Number of walker slots in the train (address, flag, data, delimiter): the most walkers an input can use.",
      engine: res.K !== undefined ? String(res.K) : "—",
      paper: p.walkers_max !== undefined ? String(p.walkers_max) : "",
      formula: p.walkers_formula,
    },
    {
      id: "walkers",
      label: "Walkers in this input",
      title: "Walkers actually present in the input: the maximum over branches and the |α|²-weighted mean (address bit 0 = empty slot).",
      engine: res.walkers_input
        ? `max ${res.walkers_input.max} · ⟨N⟩ ${formatNumber(res.walkers_input.expected, 2)}`
        : "—",
      paper: "",
    },
    {
      id: "gates",
      label: "Gate locations",
      title: "The routing gates sit at every bifurcation of the input tree (2ⁿ − 1 of each type, per tree); the paper counts all of them.",
      engine: loc ? gateLocationText(loc) : "—",
      paper: p.gates !== undefined ? String(p.gates) : "",
      formula: p.gates_formula,
    },
    {
      id: "copy",
      label: "Copy gates per cell",
      title: "Gates of the query phase installed in each of the 2ⁿ memory cells.",
      engine: loc
        ? `${Object.entries(loc.copy_per_cell)
            .map(([t, c]) => `${gateTypeName(t)} ×${c}`)
            .join(", ")} · ${loc.cells} cells`
        : "—",
      paper: "",
    },
    {
      id: "sites_level",
      label: "Sites per edge n_sites(d)",
      title: "Sites on one edge of level d = 1…n, then the memory lane. Engine edges host the control and every slot behind it.",
      engine: levels.length ? `${tree.join(", ")}${lane !== undefined ? ` | lane ${lane}` : ""}` : "—",
      paper: p.n_sites_per_level ? p.n_sites_per_level.join(", ") : "",
      formula: p.n_sites_formula,
    },
    {
      id: "sites_path",
      label: "Sites along a root-to-cell path",
      title: "Sites crossed from the input port to a memory cell (the engine value includes the memory lane; tree-only in brackets).",
      engine:
        res.sites_path !== undefined
          ? `${res.sites_path}${res.sites_path_tree_only !== undefined ? ` (tree ${res.sites_path_tree_only})` : ""}`
          : "—",
      paper: p.sites_path !== undefined ? String(p.sites_path) : "",
      formula: p.sites_path_formula,
    },
    {
      id: "sites_total",
      label: "Sites in total",
      title: "All sites of the input tree and of the 2ⁿ memory lanes.",
      engine: res.sites_total !== undefined ? String(res.sites_total) : "—",
      paper: "",
    },
    {
      id: "ticks",
      label: "Ticks T_fwd, T_q, T_total",
      title: "Clock ticks of routing, query and the whole run; T_total = 2·T_fwd + T_q because inverse routing replays routing backwards.",
      engine:
        res.T_total !== undefined ? `${res.T_fwd} + ${res.T_q} + ${res.T_fwd} = ${res.T_total}` : "—",
      paper: p.depth ?? "",
      help: "timing",
    },
    {
      id: "instances",
      label: "Gate instances scheduled",
      title: "Gate instances on the clock, per phase and type (they fire whether or not their control is present).",
      engine: perPhaseText(res.gate_instances),
      paper: "",
    },
    {
      id: "activations",
      label: "Activations",
      title: "Gate instances whose control was present in at least one branch; ⟨·⟩ = expected number of edge activations (|α|²-weighted), shown when it differs.",
      engine: perPhaseText(res.activations, res.activations_expected),
      paper: "",
    },
    {
      id: "crossings",
      label: "Expected Ŝ / Ŝ† crossings",
      title: "Walker crossings of a node through Ŝ (routing) and Ŝ† (inverse), weighted by branch probability; bounces = walkers lost into a sibling edge at Ŝ† (0 in ideal runs).",
      engine: res.S_crossings_expected
        ? `${Object.entries(res.S_crossings_expected)
            .map(([ph, x]) => `${ph}: ${formatNumber(x, 2)}`)
            .join(" · ")}${res.S_bounces_expected ? ` · bounces ${formatNumber(res.S_bounces_expected, 2)}` : ""}`
        : "—",
      paper: "",
    },
    {
      id: "per_tick",
      label: "Max per tick",
      title: "Largest number of gate instances firing in one tick, and of physical gate locations clocked in one tick (parallelism).",
      engine:
        res.max_instances_per_tick !== undefined
          ? `${plural(res.max_instances_per_tick, "instance")} · ${plural(res.max_gate_ops_per_tick ?? 0, "gate location")}`
          : "—",
      paper: "",
    },
  ];
  return rows;
}

// ---------------------------------------------------------------- noise summary

/** One line per noise model, as the engine describes it (engine/src/qramsim/noise.py). */
const NOISE_MODEL_HELP: Record<string, string> = {
  loss: "Kraus channel: the walker disappears (|R⟩, |B⟩ → |∅⟩) with probability p.",
  bit_flip: "Kraus channel: the colour flips (X̂: |R⟩ ↔ |B⟩) with probability p.",
  scatter_flip: "Kraus channel: colour flip right before a bifurcation, so the walker takes the wrong branch.",
  colour_dephasing: "Kraus channel: phase flip Ẑ between |R⟩ and |B⟩ with probability p.",
  presence_dephasing: "Kraus channel: phase flip Ẑ′ between a present walker and |∅⟩ with probability p.",
  logical_dephasing: "Kraus channel: phase flip Ẑᴸ of the logical value (sign on ○, ↑, or ∅ on the bosonic variants) with probability p.",
  logical_flip: "Kraus channel: the logical value flips with probability p: ○ ↔ ● on a qudit; on dual-rail the walker changes tree.",
  depolarizing: "Kraus channel: depolarising on span{|R⟩, |B⟩} (X̂, Ŷ, Ẑ with probability p/4 each); |∅⟩ untouched.",
  gate_failure: "Classical error: a gate silently does not fire on an edge (it acts as the identity).",
  clock_jitter: "Classical error: a scheduled gate instance fires one tick early or late.",
  copy_error: "Classical error: a copy gate reads the stored bit inverted in a cell.",
  memory_bit_flip: "Classical error: stored bits are flipped before the run; metrics compare with the intended memory.",
  overrotation:
    "Coherent error: every colour flip of an active controlled gate becomes X̂_ε = cos θ X̂ − i sin θ Î, θ = επ/2, with a static ε per gate and edge.",
  beam_splitter_imbalance:
    "Coherent error: after Ŝ routes a walker forward, the two output ports are mixed with angle φ = ηπ/2, with a static η per node.",
  prune: "Branches with |α|² below prune_eps (or beyond max_branches) are dropped; the weight is not renormalised.",
};

/** Coherent error models (DECISION D30): static miscalibrations, branches split instead of jumping. */
export const COHERENT_MODELS = ["overrotation", "beam_splitter_imbalance"];

const DEFAULT_OVERROTATION_GATES = ["U", "U_in", "U_B"];

/** Models whose outcome is sampled classically (D27): they act per gate or per cell. */
const CLASSICAL_TARGETS: Record<string, string> = {
  gate_failure: "each firing, per edge",
  clock_jitter: "each scheduled instance",
  copy_error: "each copy, per cell",
  memory_bit_flip: "each stored bit",
};

const LOCATION_NAMES: Record<string, string> = {
  propagation: "propagation",
  gate: "tree gates",
  memory: "lane gates",
  scattering: "bifurcations",
  idle: "idle (query)",
};

const ALL_PHASES = ["inverse", "query", "routing"];

export interface NoiseChannelRow {
  model: string;
  /** Coherent error (D30): parameters ε/η and σ instead of a probability. */
  coherent: boolean;
  /** "bit flip", "gate failure", … */
  name: string;
  /** Guide anchor of the model. */
  anchor: string;
  /** One-line description (tooltip). */
  help: string;
  /** "p = 0.01" or "p_early = 0.1, p_late = 0.05". */
  prob: string;
  /** Locations where the channel acts. */
  where: string;
  /** Slots (Kraus channels) or units (classical errors) it acts on. */
  targets: string;
  phases: string;
  /** False when the probability is 0: the channel is skipped and the run is ideal for it. */
  active: boolean;
  /** Conventions of coherent channels (vacuum phase, backward crossing; D31). */
  extra: { text: string; title: string }[];
}

/** Configuration entry of channel `i` (the engine keeps the order of `config.noise`). */
function entryFor(entries: NoiseEntryJSON[] | undefined, i: number, model: string): NoiseEntryJSON | undefined {
  const e = entries?.[i];
  return e && e.model === model ? e : undefined;
}

function coherentRow(
  c: NoiseMetaJSON["channels"][number],
  e: NoiseEntryJSON | undefined,
): Pick<NoiseChannelRow, "prob" | "where" | "targets" | "extra"> {
  const sigma = e?.sigma ?? 0;
  if (c.model === "overrotation") {
    const gates = e?.gates ?? DEFAULT_OVERROTATION_GATES;
    const vac = e?.vacuum_phase ?? false;
    return {
      prob: `ε = ${formatProb(e?.epsilon ?? 0)}, σ = ${formatProb(sigma)}`,
      where: `colour flips of ${gates.join(", ")}`,
      targets: "each present target",
      extra: [
        vac
          ? {
              text: "vacuum phase on",
              title:
                "X̂_ε acts literally on the three-level target: an empty target site gets the phase e^{−iθ} (option; off by default)",
            }
          : {
              text: "vacuum phase off",
              title: "X̂_ε acts only on the colour of a present walker; empty targets are untouched (default)",
            },
      ],
    };
  }
  const backward = e?.backward ?? "reciprocal";
  return {
    prob: `η = ${formatProb(e?.eta ?? 0)}, σ = ${formatProb(sigma)}`,
    where: "bifurcations, after Ŝ",
    targets: "each walker routed forward",
    extra: [
      backward === "reciprocal"
        ? {
            text: "backward: reciprocal (Ŝ† M)",
            title:
              "A walker crossing back sees the transpose of the forward device, Ŝ† M: the mixing does not cancel (default)",
          }
        : {
            text: "backward: adjoint (Ŝ† M†)",
            title:
              "A walker crossing back undoes the forward crossing exactly, Ŝ† M† (option)",
          },
    ],
  };
}

/**
 * Rows of the noise summary of a run (`meta.noise`), slot names shown as their labels.
 * The parameters of coherent channels (ε, η, σ, conventions) are read from the matching
 * configuration entries (`config.noise`, same order).
 */
export function noiseChannelRows(
  noise: NoiseMetaJSON,
  meta: Pick<MetaJSON, "slots">,
  entries?: NoiseEntryJSON[],
): NoiseChannelRow[] {
  const label = new Map(meta.slots.map((s) => [s.name, s.label]));
  return noise.channels.map((c, i) => {
    const phases = [...c.phases].sort();
    const phaseText =
      phases.length === ALL_PHASES.length && ALL_PHASES.every((p) => phases.includes(p)) ? "all phases" : phases.join(", ");
    if (COHERENT_MODELS.includes(c.model)) {
      return {
        model: c.model,
        coherent: true,
        name: c.model === "beam_splitter_imbalance" ? "beam-splitter imbalance" : "over-rotation",
        anchor: noiseAnchor(c.model),
        help: NOISE_MODEL_HELP[c.model] ?? c.model,
        ...coherentRow(c, entryFor(entries, i, c.model)),
        phases: phaseText,
        active: c.active,
      };
    }
    const classical = CLASSICAL_TARGETS[c.model];
    const allSlots = c.targets.length === meta.slots.length;
    const before = c.model === "memory_bit_flip";
    return {
      model: c.model,
      coherent: false,
      name: c.model.replace(/_/g, " "),
      anchor: noiseAnchor(c.model),
      help: NOISE_MODEL_HELP[c.model] ?? c.model,
      prob:
        c.model === "clock_jitter"
          ? `p_early = ${formatProb(c.p_early)}, p_late = ${formatProb(c.p_late)}`
          : `p = ${formatProb(c.p)}`,
      where: before ? "the memory cells" : c.where.map((w) => LOCATION_NAMES[w] ?? w).join(", ") || "—",
      targets: classical ?? (allSlots ? "all slots" : c.targets.map((t) => label.get(t) ?? t).join(", ") || "—"),
      phases: before ? "before the run" : phaseText,
      active: c.active,
      extra: [],
    };
  });
}

/** True when at least one noise channel of the run has a non-zero probability. */
export function hasActiveNoise(traj: Pick<Trajectory, "meta">): boolean {
  return traj.meta.noise?.channels.some((c) => c.active) ?? false;
}

/** How the run depends on the seed: "stochastic" (quantum jumps or classical errors),
 *  "drawn" (only coherent errors with σ > 0: one draw of the miscalibrations),
 *  "deterministic" (only coherent errors with σ = 0), "ideal" (no active channel). */
export type NoiseRandomness = "stochastic" | "drawn" | "deterministic" | "ideal";

export function noiseRandomness(traj: Pick<Trajectory, "meta" | "config">): NoiseRandomness {
  const channels = traj.meta.noise?.channels ?? [];
  const entries = traj.config.noise;
  let coherent = false;
  let drawn = false;
  let stochastic = false;
  channels.forEach((c, i) => {
    if (!c.active) return;
    if (COHERENT_MODELS.includes(c.model)) {
      coherent = true;
      if ((entryFor(entries, i, c.model)?.sigma ?? 0) > 0) drawn = true;
    } else {
      stochastic = true;
    }
  });
  if (stochastic) return "stochastic";
  if (drawn) return "drawn";
  return coherent ? "deterministic" : "ideal";
}

/** The note under the noise summary: what the metrics of this single run stand for. */
export function noiseSampleNote(traj: Pick<Trajectory, "meta" | "config">): string {
  const channels = traj.meta.noise?.channels ?? [];
  const drawnToo = channels.some(
    (c, i) => c.active && COHERENT_MODELS.includes(c.model) && (entryFor(traj.config.noise, i, c.model)?.sigma ?? 0) > 0,
  );
  switch (noiseRandomness(traj)) {
    case "stochastic":
      return drawnToo
        ? "This is one quantum-jump trajectory with one draw of the static miscalibrations; the metrics below are for this sample."
        : "This is one quantum-jump trajectory; the metrics below are for this sample.";
    case "drawn":
      return "The static miscalibrations (ε, η) were drawn once for this run (σ > 0); the metrics below are for this draw.";
    case "deterministic":
      return "Coherent errors with fixed parameters (σ = 0): the evolution is deterministic and the metrics below are exact, up to the discarded weight.";
    case "ideal":
      return "Every channel has probability (or strength) 0: this run is ideal.";
  }
}

export interface CoherentSamples {
  overrotation: { gate: string; edge: number; epsilon: number }[];
  imbalance: { node: [number, number]; eta: number }[];
}

/** The static values of the coherent errors sampled for this run (`meta.noise.coherent`). */
export function coherentSamples(noise: NoiseMetaJSON): CoherentSamples {
  const out: CoherentSamples = { overrotation: [], imbalance: [] };
  for (const c of noise.coherent ?? []) {
    if (c.model === "overrotation") out.overrotation.push({ gate: c.gate, edge: c.edge, epsilon: c.epsilon });
    else out.imbalance.push({ node: c.node, eta: c.eta });
  }
  return out;
}

/** Three significant digits with a typographic minus: 0.140818 → "0.141". */
export function formatParam(x: number): string {
  return String(Number(x.toPrecision(3))).replace("e-", `e${MINUS}`).replace(/^-/, MINUS);
}

/** "3 values, all 0.05" or "3 values, 0.0489 … 0.141, mean 0.0994". */
export function sampleSummary(values: number[]): string {
  if (values.length === 0) return "none";
  const n = `${values.length} value${values.length === 1 ? "" : "s"}`;
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  if (lo === hi) return `${n}, all ${formatParam(lo)}`;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return `${n}, ${formatParam(lo)} … ${formatParam(hi)}, mean ${formatParam(mean)}`;
}

/** "b_1 of |11⟩" (rendered with Scripted) for a stored bit flipped before the run. */
export function memoryFlipText(f: { address: string; j: number }): string {
  return `b_${f.j} of |${f.address}⟩`;
}

/** "U1 · routing tick 5 → 1 tick late" for a jittered gate instance. */
export function jitterText(j: { gate: string; phase: string; tick: number; shift: number }): string {
  const n = Math.abs(j.shift);
  return `${j.gate} · ${j.phase} tick ${j.tick} → ${n} tick${n === 1 ? "" : "s"} ${j.shift < 0 ? "early" : "late"}`;
}

// ---------------------------------------------------------------- ensemble

export const ENSEMBLE_DEFAULT_RUNS = 200;
export const ENSEMBLE_MAX_RUNS = 2000;

/** Number of ensemble runs typed by the user, or null unless it is a whole number in 1…2000. */
export function parseRuns(text: string): number | null {
  const t = text.trim();
  if (!/^\d+$/.test(t)) return null;
  const n = Number(t);
  return n >= 1 && n <= ENSEMBLE_MAX_RUNS ? n : null;
}

/** Quantities of an ensemble result, in display order (engine/src/qramsim/sweeps.py). */
export const ENSEMBLE_KEYS = [
  "fidelity",
  "heralded_fidelity",
  "success",
  "consistency",
  "entropy_AD",
  "collided",
  "discarded",
  "noise_events",
] as const;

/** Seed of the displayed run: the ensemble starts there (seeds seed0, seed0 + 1, …). */
export function runSeed(traj: Pick<Trajectory, "meta" | "config">): number {
  return traj.meta.noise?.seed ?? traj.config.seed ?? 0;
}
