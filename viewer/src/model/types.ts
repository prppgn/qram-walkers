// TypeScript mirror of the engine formats: qramsim.run/1 (RunConfig) and
// qramsim.traj/1 (Trajectory). See engine/src/qramsim/trajectory.py.
// The viewer only reads these objects; it never computes physics.

export type Amp = [number, number];
/** [level, branch, site]; level 0 is the port line outside the tree (site ≤ 0). */
export type Pos = [number, number, number];
/** Bosonic E, R, B; qudit oR, oB, fR, fB (○/●); dual-rail uR, uB, dR, dB (↑/↓) and the
 *  auxiliary rail xR, xB of the cell output circuit (src/model/states.ts). */
export type LocalState =
  | "E"
  | "R"
  | "B"
  | "oR"
  | "oB"
  | "fR"
  | "fB"
  | "uR"
  | "uB"
  | "dR"
  | "dB"
  | "xR"
  | "xB";
export type Phase = "init" | "routing" | "query" | "inverse";

export interface InputTermJSON {
  address: string;
  amp: Amp;
}

export interface RunConfigJSON {
  schema?: string;
  variant: string;
  n: number;
  m: number;
  copy_mode: string;
  options?: {
    include_last_backup?: boolean;
    query_stagger?: boolean;
    query?: boolean;
    inverse_mode?: string;
    n_sites?: Record<string, number>;
    strict?: boolean;
    prune_eps?: number;
    max_branches?: number;
  };
  input: { terms: InputTermJSON[] };
  memory: { bits: number[][] } | { fill: string; seed?: number | null };
  noise?: NoiseEntryJSON[];
  seed?: number;
  record?: { frames?: boolean; ghosts?: boolean; frame_metrics?: boolean; max_frame_branches?: number };
}

export interface GhostJSON {
  c: LocalState;
  pos: Pos;
  dir: number;
}

export interface WalkerJSON {
  k: number;
  s: LocalState;
  pos?: Pos;
  dir?: number;
  ghost?: GhostJSON;
}

/** A walker outside the train's slots, created by a copy on an empty site (DECISION
 *  D21); `k` is the time bin it shares (−1 if none). */
export interface StrayJSON {
  k: number;
  s: LocalState;
  pos: Pos;
  dir: number;
}

export interface BranchJSON {
  id: number;
  amp: Amp;
  walkers: WalkerJSON[];
  cells?: { on: number[] };
  strays?: StrayJSON[];
  /** Two walkers met on one site: the branch is frozen and counts as failure (D26). */
  collided?: boolean;
}

export interface GateChange {
  b: number;
  k: number;
  from: LocalState;
  to: LocalState;
  ghost?: boolean;
}

export interface Crossing {
  b: number;
  from_s: LocalState;
  to_s: LocalState;
  node?: [number, number];
  from?: [number, number];
  to?: [number, number];
}

export type EventJSON =
  | { kind: "phase"; phase: string; text: string }
  | { kind: "turn"; text: string }
  | {
      kind: "gate";
      gate: string;
      type: string;
      level: number;
      phase: string;
      edges: [number, number][];
      fired_in: number[];
      changes: GateChange[];
      text: string;
    }
  | { kind: "scatter"; k: number; dir: "fwd" | "bwd" | "bounce"; crossings: Crossing[]; text: string }
  | { kind: "inject" | "exit" | "absorb"; k: number; branches: number[]; text: string }
  | {
      kind: "noise";
      model: string;
      text: string;
      where?: string;
      k?: number;
      op?: number;
      branches?: number[];
      p?: number;
      gate?: string;
      edges?: [number, number][];
      flips?: { l: number; address: string; j: number }[];
    }
  | { kind: "stray"; gate: string; b: number; bin: number; pos: Pos; text: string }
  | { kind: "collision"; b: number; pos: Pos; text: string };

export interface FrameJSON {
  t: number;
  phase: Phase;
  branches: BranchJSON[];
  events: EventJSON[];
  metrics?: Record<string, number>;
  /** Branches not stored (record.max_frame_branches): count and total weight. */
  omitted?: { count: number; weight: number };
}

export interface SlotJSON {
  k: number;
  name: string;
  label: string;
  role: string;
  register: "A" | "D";
  backup: boolean;
  bit: number;
  /** Path offset: the slot stands at x = t − offset (= k except in dualrail_backup). */
  offset?: number;
  /** Dual-rail backups: "u" (W̃^↑) or "d" (W̃^↓). */
  rail?: string;
}

export interface GateJSON {
  id: string;
  type: string;
  level: number;
  label: string;
  control_site: number | null;
  target_sites: number[];
  window: number[];
  target_bits: number[];
  control_slot: number | null;
  target_slots: number[];
  ticks: Record<string, number>;
}

export interface MetaJSON {
  variant: string;
  family: string;
  copy_mode: string;
  n: number;
  m: number;
  K: number;
  /** Distinct path offsets of the train (= K except in dualrail_backup). */
  span?: number;
  slots: SlotJSON[];
  geometry: {
    levels: { d: number; n_sites: number }[];
    memory_sites: number;
    trees: number;
    cells: { l: number; address: string }[];
  };
  warnings: string[];
  phases: { T_fwd: number; T_q: number; T_total: number };
  gates: GateJSON[];
  input_normalised: { id: number; address: string; amp: Amp }[];
  memory: number[][];
  marks?: { level: { t: number; label: string }[] };
  noise?: NoiseMetaJSON;
  /** Branch id → label; branches created by coherent errors are labelled like |10⟩′3. */
  branch_labels?: Record<string, string>;
}

/** One noise entry of a run configuration (DESIGN.md §4.1). */
export interface NoiseEntryJSON {
  model: string;
  p?: number;
  p_early?: number;
  p_late?: number;
  epsilon?: number;
  eta?: number;
  sigma?: number;
  backward?: "adjoint" | "reciprocal";
  vacuum_phase?: boolean;
  /** `depolarizing` on the qudit and dual-rail variants: what it acts on (D35). */
  on?: "colour" | "logical" | "both";
  where?: string[];
  targets?: string | string[];
  phases?: string[];
  gates?: string[];
}

export interface NoiseMetaJSON {
  channels: {
    model: string;
    p: number;
    p_early: number;
    p_late: number;
    where: string[];
    targets: string[];
    phases: string[];
    active: boolean;
  }[];
  seed: number;
  memory_flips: { l: number; address: string; j: number }[];
  memory_actual: number[][];
  jitter: { gate: string; phase: string; tick: number; shift: number }[];
  coherent?: (
    | { model: "overrotation"; gate: string; edge: number; epsilon: number }
    | { model: "beam_splitter_imbalance"; node: [number, number]; eta: number }
  )[];
}

export interface EnsembleJSON {
  runs: number;
  seed0: number;
  mean: Record<string, number>;
  std: Record<string, number>;
  sem: Record<string, number>;
}

export interface ReadoutJSON {
  id: number;
  amp: Amp;
  prob: number;
  address: string;
  data: string;
  expected_data: string;
  /** Slots with no walker in the particle-conserving variants: a heralded loss (D35). */
  erased?: string[];
  well_formed: boolean;
}

export interface CheckpointJSON {
  name: string;
  description: string;
  t: number;
  branches: BranchJSON[];
}

export interface Trajectory {
  schema: string;
  config: RunConfigJSON;
  meta: MetaJSON;
  frames: FrameJSON[];
  final: {
    state: BranchJSON[];
    readout: ReadoutJSON[];
    metrics: Record<string, number>;
    resources: Record<string, unknown>;
    checkpoints?: CheckpointJSON[];
    state_omitted?: { count: number; weight: number } | null;
  };
}

export interface PresetJSON {
  name: string;
  title: string;
  description: string;
  config: RunConfigJSON;
}

/** Throws unless the object looks like a qramsim.traj/1 trajectory. */
export function checkTrajectory(data: unknown): Trajectory {
  const t = data as Partial<Trajectory> | null;
  if (!t || typeof t !== "object") throw new Error("not a trajectory");
  if (typeof t.schema !== "string" || !t.schema.startsWith("qramsim.traj/")) {
    throw new Error(`unknown schema ${String(t.schema)}`);
  }
  const major = t.schema.split("/")[1]?.split(".")[0];
  if (major !== "1") throw new Error(`unsupported trajectory version ${t.schema}`);
  if (!t.meta || !t.frames || !t.final) throw new Error("trajectory lacks meta/frames/final");
  return t as Trajectory;
}
