// Pure helpers of the information panels, checked against the fixture trajectories.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anchorForEvent,
  collidedBranches,
  DEFAULT_FILTER,
  ENSEMBLE_KEYS,
  eventBranches,
  eventGateId,
  eventKindLabel,
  eventKindTitle,
  filterEvents,
  flattenEvents,
  formatEstimate,
  formatExp,
  formatNearOne,
  formatProb,
  formulaParts,
  coherentSamples,
  formatParam,
  formatWeight,
  hasActiveNoise,
  isIdleGate,
  isNoiseEvent,
  jitterText,
  memoryFlipText,
  noiseAnchor,
  noiseChannelRows,
  noiseRandomness,
  noiseSampleNote,
  omittedText,
  parseRuns,
  sampleSummary,
  quietFrameText,
  resourceRows,
  runSeed,
  tickLabel,
  type EngineResources,
} from "../src/components/panels/helpAnchors";
import { branchLabel } from "../src/layout/kets";
import { checkTrajectory, type EventJSON, type Trajectory } from "../src/model/types";

function load(path: string): Trajectory {
  return checkTrajectory(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8")));
}

const E1 = load("../../engine/tests/golden/E1.traj.json");
const E2 = load("./fixtures/E2.traj.json");
const E1S = load("./fixtures/E1-switch.traj.json");
const E3 = load("./fixtures/E3.traj.json");
const ALL = [E1, E2, E1S];
// scatter_flip on D₁ → stray created by the copy (D21) → collision (D26), n = 1
const NS = load("./fixtures/noise-stray.traj.json");
// E2 with a loss of D₁ at a bifurcation and a memory bit flip (b₁ of |11⟩)
const NL = load("./fixtures/noise-loss.traj.json");
// E2 with over-rotation (ε = 0.1, σ = 0.02) and a reciprocal imbalance (η = 0.05):
// branch splits, pruning (prune_eps = 1e−3), at most 4 stored branches per frame
const NC = load("./fixtures/noise-coherent.traj.json");
const NOISY = [NS, NL];

function eventKey(e: EventJSON): string {
  return e.kind === "gate"
    ? `gate:${e.type}`
    : e.kind === "scatter"
      ? `scatter:${e.dir}`
      : e.kind === "phase"
        ? `phase:${e.phase}`
        : e.kind === "noise"
          ? `noise:${e.model}`
          : e.kind;
}

describe("anchorForEvent", () => {
  it("maps every event kind and type of the fixtures to a guide anchor", () => {
    const seen = new Map<string, string>();
    for (const traj of ALL) {
      for (const r of flattenEvents(traj)) {
        const e = r.event;
        const key =
          e.kind === "gate" ? `gate:${e.type}` : e.kind === "scatter" ? `scatter:${e.dir}` : e.kind === "phase" ? `phase:${e.phase}` : e.kind;
        seen.set(key, anchorForEvent(e));
      }
    }
    expect(Object.fromEntries(seen)).toEqual({
      "phase:routing": "routing",
      "phase:query": "query",
      "phase:inverse": "inverse",
      "phase:done": "phases",
      inject: "train",
      exit: "train",
      turn: "inverse",
      "gate:U": "gate-U",
      "gate:copy_global": "gate-copy-global",
      "gate:cell_on": "gate-cell-on",
      "gate:copy_cell": "gate-copy-cell",
      "gate:cell_off": "gate-cell-off",
      "scatter:fwd": "gate-S",
      "scatter:bwd": "gate-S-dag",
    });
  });

  it("sends Ŝ† bounces to the Ŝ† page", () => {
    const bounce: EventJSON = { kind: "scatter", k: 1, dir: "bounce", crossings: [], text: "" };
    expect(anchorForEvent(bounce)).toBe("gate-S-dag");
    expect(eventKindLabel(bounce)).toBe("Ŝ† bounce");
  });

  it("labels kinds for the badges", () => {
    const labels = new Set(flattenEvents(E2).map((r) => eventKindLabel(r.event)));
    expect([...labels].sort()).toEqual(["exit", "gate", "inject", "phase", "turn", "Ŝ", "Ŝ†"].sort());
  });
});

describe("flattenEvents", () => {
  it("keeps frame order and the frame each event belongs to", () => {
    const rows = flattenEvents(E1S);
    const total = E1S.frames.reduce((a, f) => a + f.events.length, 0);
    expect(rows).toHaveLength(total);
    for (const r of rows) {
      expect(E1S.frames[r.frame]!.events[r.index]).toBe(r.event);
      expect(r.t).toBe(r.frame - 1);
      expect(r.phase).toBe(E1S.frames[r.frame]!.phase);
    }
    expect(rows.map((r) => r.frame)).toEqual([...rows.map((r) => r.frame)].sort((a, b) => a - b));
    // the first event opens the routing at tick 0, the last one closes the run
    expect(rows[0]!.event.kind).toBe("phase");
    expect(rows[0]!.t).toBe(0);
    expect(rows.at(-1)!.event).toMatchObject({ kind: "phase", phase: "done" });
    expect(rows.at(-1)!.frame).toBe(E1S.frames.length - 1);
  });
});

describe("filterEvents", () => {
  const rows = flattenEvents(E1S);

  it("returns everything with the default filter", () => {
    expect(filterEvents(rows, DEFAULT_FILTER)).toEqual(rows);
  });

  it("filters by kind", () => {
    const gates = filterEvents(rows, { ...DEFAULT_FILTER, kind: "gate" });
    expect(gates.map((r) => (r.event.kind === "gate" ? r.event.gate : "?"))).toEqual([
      "U1",
      "U2",
      "cell_on",
      "copy_D1",
      "cell_off",
      "U2",
      "U1",
    ]);
    const port = filterEvents(rows, { ...DEFAULT_FILTER, kind: "port" });
    expect(port.every((r) => r.event.kind === "inject" || r.event.kind === "exit")).toBe(true);
    expect(port).toHaveLength(8);
    const phase = filterEvents(rows, { ...DEFAULT_FILTER, kind: "phase" });
    expect(phase.map((r) => r.event.kind)).toEqual(["phase", "phase", "turn", "phase", "phase"]);
    const scatter = filterEvents(rows, { ...DEFAULT_FILTER, kind: "scatter" });
    expect(scatter.every((r) => r.event.kind === "scatter")).toBe(true);
  });

  it("hides idle gates (control absent everywhere) with actedOnly", () => {
    const acted = filterEvents(rows, { ...DEFAULT_FILTER, kind: "gate", actedOnly: true });
    expect(acted.map((r) => (r.event.kind === "gate" ? r.event.gate : "?"))).toEqual([
      "U1",
      "cell_on",
      "copy_D1",
      "cell_off",
      "U1",
    ]);
    expect(acted.some((r) => isIdleGate(r.event))).toBe(false);
    // non-gate events are kept
    const all = filterEvents(rows, { ...DEFAULT_FILTER, actedOnly: true });
    expect(all).toHaveLength(rows.length - 2);
  });

  it("searches text, gate ids, kinds and ticks case-insensitively", () => {
    expect(filterEvents(rows, { ...DEFAULT_FILTER, search: "cell switch" }).length).toBeGreaterThan(0);
    const d2 = filterEvents(rows, { ...DEFAULT_FILTER, search: "D₂" });
    expect(d2.every((r) => r.event.text.includes("D₂"))).toBe(true);
    expect(d2.length).toBeGreaterThan(0);
    expect(filterEvents(rows, { ...DEFAULT_FILTER, search: "copy_d1" })).toHaveLength(1);
    expect(filterEvents(rows, { ...DEFAULT_FILTER, search: "tick 15" }).map((r) => r.frame)).toEqual([16]);
    expect(filterEvents(rows, { ...DEFAULT_FILTER, search: "  " })).toEqual(rows);
    expect(filterEvents(rows, { ...DEFAULT_FILTER, search: "no such thing" })).toEqual([]);
  });
});

describe("eventBranches", () => {
  it("lists the branches touched by each event", () => {
    const rows = flattenEvents(E2);
    const u1 = rows.find((r) => r.event.kind === "gate" && r.event.gate === "U1")!.event;
    expect(eventBranches(u1)).toEqual([1]);
    const sD0 = rows.find((r) => r.event.kind === "scatter" && r.event.k === 2)!.event;
    expect(eventBranches(sD0)).toEqual([0, 1]);
    const inj = rows.find((r) => r.event.kind === "inject")!.event;
    expect(eventBranches(inj)).toEqual([1]);
    const ph = rows.find((r) => r.event.kind === "phase")!.event;
    expect(eventBranches(ph)).toEqual([]);
  });
});

describe("frame status", () => {
  it("labels ticks against T_total − 1", () => {
    expect(tickLabel(E2, 0)).toBe("before tick 0 / 22 · input");
    expect(tickLabel(E2, 6)).toBe("tick 5 / 22 · routing");
    expect(tickLabel(E2, 12)).toBe("tick 11 / 22 · query");
    expect(tickLabel(E2, 23)).toBe("tick 22 / 22 · inverse");
  });

  it("describes frames without events", () => {
    expect(quietFrameText(E1S, 0)).toMatch(/Input state/);
    expect(E1S.frames[2]!.events).toHaveLength(0);
    expect(quietFrameText(E1S, 2)).toMatch(/one site forward/);
    expect(quietFrameText(E1S, 2)).toMatch(/port line/);
    expect(E1S.frames[25]!.events).toHaveLength(0);
    expect(quietFrameText(E1S, 25)).toMatch(/back toward the port/);
    expect(E1S.frames[25]!.phase).toBe("inverse");
  });
});

describe("number formatting", () => {
  it("keeps 1 − ε visible for quantities that must be exactly 1", () => {
    expect(formatNearOne(1)).toBe("1");
    expect(formatNearOne(1 - 2.220446049250313e-16)).toBe("1 − 2.2e−16");
    expect(formatNearOne(1.0000000000000002)).toBe("1 + 2.2e−16");
    expect(formatNearOne(1 - 1e-12)).toBe("1 − 1.0e−12");
    expect(formatNearOne(0.5)).toBe("0.500000");
    expect(formatNearOne(E2.final.metrics.success!)).toBe("1 + 2.2e−16");
    expect(formatNearOne(E2.final.metrics.fidelity!)).toBe("1");
  });

  it("uses a typographic minus in exponents", () => {
    expect(formatExp(3.5e-7)).toBe("3.5e−7");
    expect(formatExp(2e5)).toBe("2.0e5");
  });

  it("splits formulas into sup/sub parts", () => {
    expect(formulaParts("2(2^n − 1)")).toEqual([
      { t: "text", v: "2(2" },
      { t: "sup", v: "n" },
      { t: "text", v: " − 1)" },
    ]);
    expect(formulaParts("n_sites^d = n + m − d")).toEqual([
      { t: "text", v: "n" },
      { t: "sub", v: "sites" },
      { t: "sup", v: "d" },
      { t: "text", v: " = n + m − d" },
    ]);
    expect(formulaParts("n + m + 1 (+1 delimiter D_{m+1})").at(-2)).toEqual({ t: "sub", v: "m+1" });
    expect(formulaParts("O(n(n + m))")).toEqual([{ t: "text", v: "O(n(n + m))" }]);
  });
});

describe("resourceRows", () => {
  const row = (traj: Trajectory, id: string) =>
    resourceRows(traj.final.resources as EngineResources, traj.meta).find((r) => r.id === id)!;

  it("puts the engine counters beside the paper formulas (E2, basic global)", () => {
    expect(row(E2, "K")).toMatchObject({ engine: "4", paper: "4", formula: "n + m + 1" });
    expect(row(E2, "walkers").engine).toBe("max 4 · ⟨N⟩ 3.00");
    expect(row(E2, "gates")).toMatchObject({ engine: "3 Û⁽ᵈ⁾ + 3 Ŝ = 6", paper: "6", formula: "2(2^n − 1)" });
    expect(row(E3, "gates")).toMatchObject({ engine: "3 Û_in + 3 Û_B + 3 Ŝ = 9", paper: "9" });
    expect(row(E2, "sites_level")).toMatchObject({ engine: "4, 3 | lane 4", paper: "2, 1" });
    expect(row(E2, "sites_path")).toMatchObject({ engine: "11 (tree 7)", paper: "3" });
    expect(row(E2, "sites_total").engine).toBe("26");
    expect(row(E2, "ticks")).toMatchObject({ engine: "11 + 1 + 11 = 23", paper: "O(n(n + m))", help: "timing" });
    expect(row(E2, "copy").engine).toBe("Û_copy⁽ᵃ⁾ ×1 · 4 cells");
    expect(row(E2, "activations").engine).toBe(
      "routing: Û⁽ᵈ⁾ 2 (⟨·⟩ 1.00) · query: Û_copy⁽ᵃ⁾ 1 · inverse: Û⁽ᵈ⁾ 2 (⟨·⟩ 1.00)",
    );
    expect(row(E2, "crossings").engine).toBe("routing: 6.00 · inverse: 5.00");
    expect(row(E2, "per_tick").engine).toBe("1 instance · 4 gate locations");
  });

  it("shows the cell-switch gates and the delimiter in E1-switch", () => {
    expect(row(E1S, "K")).toMatchObject({ engine: "5", paper: "5" });
    expect(row(E1S, "K").formula).toContain("D_{m+1}");
    expect(row(E1S, "copy").engine).toBe("Û_on ×1, Û_copy(F) ×1, Û_off ×1 · 4 cells");
    expect(row(E1S, "instances").engine).toBe(
      "routing: Û⁽ᵈ⁾ 2 · query: Û_on 1, Û_copy(F) 1, Û_off 1 · inverse: Û⁽ᵈ⁾ 2",
    );
    // classical input: activations equal their expectation, no ⟨·⟩ annotation
    expect(row(E1S, "activations").engine).toBe(
      "routing: Û⁽ᵈ⁾ 1 · query: Û_on 1, Û_copy(F) 1, Û_off 1 · inverse: Û⁽ᵈ⁾ 1",
    );
  });

  it("degrades gracefully on an empty resources object", () => {
    const rows = resourceRows({}, { n: 2, m: 1 });
    expect(rows.every((r) => r.engine === "—" && r.paper === "")).toBe(true);
  });
});

describe("noise events", () => {
  it("maps the noise-related events of the noisy fixtures to the noise pages of the guide", () => {
    const seen = new Map<string, string>();
    for (const traj of NOISY) {
      for (const r of flattenEvents(traj)) {
        if (isNoiseEvent(r.event)) seen.set(eventKey(r.event), anchorForEvent(r.event));
      }
    }
    expect(Object.fromEntries(seen)).toEqual({
      "noise:scatter_flip": "noise-scatter-flip",
      stray: "noise-strays",
      collision: "noise-collisions",
      "noise:memory_bit_flip": "noise-memory-bit-flip",
      "noise:loss": "noise-loss",
    });
  });

  it("keeps the anchors of the ideal events in the noisy fixtures", () => {
    const rows = flattenEvents(NS).filter((r) => !isNoiseEvent(r.event));
    expect(rows.length).toBeGreaterThan(0);
    for (const r of rows) expect(anchorForEvent(r.event)).not.toMatch(/^noise/);
  });

  it("covers the event kinds and models the fixtures do not reach", () => {
    const failure: EventJSON = { kind: "noise", model: "gate_failure", gate: "U1", edges: [[1, 1]], text: "" };
    const copyErr: EventJSON = { kind: "noise", model: "copy_error", gate: "copy_D1", edges: [[2, 3]], text: "" };
    const absorb: EventJSON = { kind: "absorb", k: 2, branches: [0, 1], text: "" };
    expect(anchorForEvent(failure)).toBe("noise-gate-failure");
    expect(anchorForEvent(copyErr)).toBe("noise-copy-error");
    expect(anchorForEvent(absorb)).toBe("noise-absorb");
    expect(noiseAnchor("presence_dephasing")).toBe("noise-presence-dephasing");
    expect(eventKindLabel(absorb)).toBe("absorb");
    expect(eventBranches(absorb)).toEqual([0, 1]);
    expect(eventBranches(failure)).toEqual([]);
    expect(eventGateId(failure)).toBe("U1");
    expect(eventGateId(copyErr)).toBe("copy_D1");
    expect(eventKindTitle(failure)).toMatch(/Model: gate failure$/);
    expect(isNoiseEvent(absorb)).toBe(true);
  });

  it("labels the badges noise / stray / collision", () => {
    const labels = new Set(flattenEvents(NS).map((r) => eventKindLabel(r.event)));
    expect(labels.has("noise")).toBe(true);
    expect(labels.has("stray")).toBe(true);
    expect(labels.has("collision")).toBe(true);
    expect(new Set(flattenEvents(NL).filter((r) => isNoiseEvent(r.event)).map((r) => eventKindLabel(r.event)))).toEqual(
      new Set(["noise"]),
    );
  });

  it("lists branches and gate ids of strays, collisions and jumps", () => {
    const rows = flattenEvents(NS);
    const stray = rows.find((r) => r.event.kind === "stray")!;
    expect(eventBranches(stray.event)).toEqual([0]);
    expect(eventGateId(stray.event)).toBe("copy_D1");
    const coll = rows.find((r) => r.event.kind === "collision")!;
    expect(eventBranches(coll.event)).toEqual([0]);
    expect(eventGateId(coll.event)).toBe("");
    const jump = rows.find((r) => r.event.kind === "noise")!;
    expect(eventBranches(jump.event)).toEqual([0]);
    const flip = flattenEvents(NL).find((r) => r.event.kind === "noise" && r.event.model === "memory_bit_flip")!;
    expect(eventBranches(flip.event)).toEqual([]);
  });

  it("filters noise + stray + collision + absorb with kind 'noise'", () => {
    const ns = filterEvents(flattenEvents(NS), { ...DEFAULT_FILTER, kind: "noise" });
    expect(ns.map((r) => [r.frame, r.event.kind])).toEqual([
      [6, "noise"],
      [7, "stray"],
      [8, "collision"],
    ]);
    const nl = filterEvents(flattenEvents(NL), { ...DEFAULT_FILTER, kind: "noise" });
    expect(nl.map((r) => (r.event.kind === "noise" ? `${r.frame}:${r.event.model}` : "?"))).toEqual([
      "1:memory_bit_flip",
      "8:loss",
    ]);
    // ideal runs have none, and the other kinds never include them
    expect(filterEvents(flattenEvents(E1S), { ...DEFAULT_FILTER, kind: "noise" })).toEqual([]);
    for (const kind of ["gate", "scatter", "port", "phase"] as const) {
      expect(filterEvents(flattenEvents(NS), { ...DEFAULT_FILTER, kind }).some((r) => isNoiseEvent(r.event))).toBe(false);
    }
    // the model name is searchable
    expect(filterEvents(flattenEvents(NL), { ...DEFAULT_FILTER, search: "memory_bit_flip" })).toHaveLength(1);
  });

  it("finds the collided branches of a frame", () => {
    expect(collidedBranches(NS.frames[7])).toEqual([]);
    for (let f = 8; f < NS.frames.length; f++) expect(collidedBranches(NS.frames[f])).toEqual([0]);
    expect(NL.frames.every((f) => collidedBranches(f).length === 0)).toBe(true);
    expect(collidedBranches(undefined)).toEqual([]);
    expect(NS.final.metrics.collided).toBe(1);
  });
});

describe("noise summary", () => {
  it("describes the channels of the stray fixture", () => {
    expect(noiseChannelRows(NS.meta.noise!, NS.meta)).toEqual([
      {
        model: "scatter_flip",
        name: "scatter flip",
        anchor: "noise-scatter-flip",
        help: expect.stringMatching(/wrong branch/),
        prob: "p = 1",
        where: "bifurcations",
        targets: "D₁",
        phases: "routing",
        active: true,
        coherent: false,
        extra: [],
      },
    ]);
  });

  it("describes Kraus, classical and inactive channels of the loss fixture", () => {
    const rows = noiseChannelRows(NL.meta.noise!, NL.meta);
    expect(rows.map((r) => [r.name, r.prob, r.where, r.targets, r.phases, r.active])).toEqual([
      ["loss", "p = 1", "bifurcations", "D₁", "routing", true],
      ["memory bit flip", "p = 0.5", "the memory cells", "each stored bit", "before the run", true],
      ["gate failure", "p = 0", "tree gates, lane gates", "each firing, per edge", "all phases", false],
    ]);
    expect(NL.meta.noise!.memory_flips.map(memoryFlipText)).toEqual(["b_1 of |11⟩"]);
  });

  it("shows jitter probabilities and shifts", () => {
    const rows = noiseChannelRows(
      {
        channels: [
          { model: "clock_jitter", p: 0, p_early: 0.1, p_late: 0.05, where: ["gate"], targets: [], phases: ["routing"], active: true },
          { model: "depolarizing", p: 1e-7, p_early: 0, p_late: 0, where: ["gate", "memory"], targets: ["A_1", "A_2", "D_0", "D_1"], phases: ["inverse", "query", "routing"], active: true },
        ],
        seed: 3,
        memory_flips: [],
        memory_actual: [],
        jitter: [],
      },
      NL.meta,
    );
    expect(rows[0]).toMatchObject({ prob: "p_early = 0.1, p_late = 0.05", targets: "each scheduled instance", where: "tree gates" });
    expect(rows[1]).toMatchObject({ prob: "p = 1e−7", targets: "all slots", phases: "all phases" });
    expect(jitterText({ gate: "copy_D1", phase: "query", tick: 11, shift: -1 })).toBe("copy_D1 · query tick 11 → 1 tick early");
    expect(jitterText({ gate: "U2", phase: "inverse", tick: 14, shift: 2 })).toBe("U2 · inverse tick 14 → 2 ticks late");
  });

  it("knows whether the ensemble would be trivial", () => {
    expect(hasActiveNoise(NS)).toBe(true);
    expect(hasActiveNoise(NL)).toBe(true);
    expect(hasActiveNoise(E2)).toBe(false);
    const off = { ...NL.meta, noise: { ...NL.meta.noise!, channels: NL.meta.noise!.channels.map((c) => ({ ...c, active: false })) } };
    expect(hasActiveNoise({ meta: off })).toBe(false);
    expect(runSeed(NL)).toBe(4);
    expect(runSeed(NS)).toBe(0);
    expect(runSeed(E2)).toBe(E2.config.seed ?? 0);
  });
});

describe("ensemble helpers", () => {
  it("parses the number of runs (1…2000)", () => {
    expect(parseRuns("200")).toBe(200);
    expect(parseRuns(" 1 ")).toBe(1);
    expect(parseRuns("2000")).toBe(2000);
    expect(parseRuns("2001")).toBeNull();
    expect(parseRuns("0")).toBeNull();
    expect(parseRuns("12.5")).toBeNull();
    expect(parseRuns("-3")).toBeNull();
    expect(parseRuns("")).toBeNull();
    expect(parseRuns("1e3")).toBeNull();
  });

  it("formats mean ± standard error with two significant digits of the error", () => {
    expect(formatEstimate(0.8234, 0.0123)).toBe("0.823 ± 0.012");
    expect(formatEstimate(0.5, 0.25)).toBe("0.50 ± 0.25");
    expect(formatEstimate(3.21, 1.5)).toBe("3.2 ± 1.5");
    expect(formatEstimate(12.3, 15)).toBe("12 ± 15");
    expect(formatEstimate(1, 0)).toBe("1 ± 0");
    expect(formatEstimate(0.75, 0)).toBe("0.7500 ± 0");
    expect(formatEstimate(1e-17, 1e-18)).toBe("0 ± 0");
    expect(formatEstimate(-0.004, 0.002)).toBe("−0.0040 ± 0.0020");
  });

  it("formats configuration probabilities", () => {
    expect(formatProb(0.01)).toBe("0.01");
    expect(formatProb(1)).toBe("1");
    expect(formatProb(1 / 3)).toBe("0.3333");
    expect(formatProb(2e-7)).toBe("2e−7");
  });

  it("lists the quantities returned by the engine", () => {
    expect([...ENSEMBLE_KEYS]).toEqual([
      "fidelity",
      "heralded_fidelity",
      "success",
      "consistency",
      "entropy_AD",
      "collided",
      "discarded",
      "noise_events",
    ]);
  });
});

describe("coherent errors (D30)", () => {
  const noiseRows = flattenEvents(NC).filter((r) => isNoiseEvent(r.event));

  it("maps over-rotation, imbalance and pruning events to their guide anchors", () => {
    const seen = new Map<string, string>();
    for (const r of noiseRows) seen.set(eventKey(r.event), anchorForEvent(r.event));
    expect(Object.fromEntries(seen)).toEqual({
      "noise:overrotation": "noise-overrotation",
      "noise:beam_splitter_imbalance": "noise-imbalance",
      "noise:prune": "noise-pruning",
      // error branches also meet strays, collisions and the lane end in this fixture
      stray: "noise-strays",
      collision: "noise-collisions",
      absorb: "noise-absorb",
    });
    expect(noiseAnchor("beam_splitter_imbalance")).toBe("noise-imbalance");
    expect(noiseAnchor("prune")).toBe("noise-pruning");
    expect(noiseAnchor("overrotation")).toBe("noise-overrotation");
  });

  it("keeps them in the noise filter, with gate ids for over-rotations and no branch list", () => {
    const filtered = filterEvents(flattenEvents(NC), { ...DEFAULT_FILTER, kind: "noise" });
    expect(filtered).toEqual(noiseRows);
    const models = filtered.map((r) => (r.event.kind === "noise" ? r.event.model : r.event.kind));
    expect(models.filter((m) => m === "overrotation")).toHaveLength(4);
    expect(models.filter((m) => m === "beam_splitter_imbalance")).toHaveLength(16);
    expect(models.filter((m) => m === "prune")).toHaveLength(16);
    const over = filtered.find((r) => r.event.kind === "noise" && r.event.model === "overrotation")!.event;
    expect(eventGateId(over)).toBe("U1");
    expect(filtered.filter((r) => r.event.kind === "noise").every((r) => eventBranches(r.event).length === 0)).toBe(true);
    const absorb = filtered.find((r) => r.event.kind === "absorb")!;
    const absorbed = eventBranches(absorb.event);
    expect(absorbed).toEqual([85]);
    expect(branchLabel(absorbed[0]!, NC.meta.input_normalised, NC.meta.branch_labels)).toBe("|00⟩′5");
    expect(eventKindLabel(over)).toBe("noise");
    expect(eventKindTitle(over)).toMatch(/Model: overrotation$/);
  });

  it("lists the coherent channels with their parameters and conventions", () => {
    const rows = noiseChannelRows(NC.meta.noise!, NC.meta, NC.config.noise);
    expect(rows.map((r) => [r.name, r.coherent, r.prob, r.where, r.targets, r.phases, r.active])).toEqual([
      ["over-rotation", true, "ε = 0.1, σ = 0.02", "colour flips of U, U_in, U_B", "each present target", "all phases", true],
      ["beam-splitter imbalance", true, "η = 0.05, σ = 0", "bifurcations, after Ŝ", "each walker routed forward", "all phases", true],
    ]);
    expect(rows.map((r) => r.extra.map((x) => x.text))).toEqual([["vacuum phase off"], ["backward: reciprocal (Ŝ† M)"]]);
    expect(rows.map((r) => r.anchor)).toEqual(["noise-overrotation", "noise-imbalance"]);
    // the defaults (D31) when the entry sets no convention
    const plain = noiseChannelRows(NC.meta.noise!, NC.meta, [
      { model: "overrotation", epsilon: 0.05, vacuum_phase: true, gates: ["U"] },
      { model: "beam_splitter_imbalance", eta: -0.02, sigma: 0.01 },
    ]);
    expect(plain.map((r) => [r.prob, r.where, r.extra[0]!.text])).toEqual([
      ["ε = 0.05, σ = 0", "colour flips of U", "vacuum phase on"],
      ["η = −0.02, σ = 0.01", "bifurcations, after Ŝ", "backward: reciprocal (Ŝ† M)"],
    ]);
    // entries that do not match the channel are ignored
    expect(noiseChannelRows(NC.meta.noise!, NC.meta, [{ model: "loss", p: 0.1 }])[0]!.prob).toBe("ε = 0, σ = 0");
  });

  it("summarises the static values sampled for this run", () => {
    const { overrotation, imbalance } = coherentSamples(NC.meta.noise!);
    expect(overrotation.map((r) => `${r.gate}/${r.edge}`)).toEqual(["U1/1", "U2/1", "U2/2"]);
    expect(imbalance.map((r) => r.node)).toEqual([
      [1, 1],
      [2, 1],
      [2, 2],
    ]);
    expect(sampleSummary(overrotation.map((r) => r.epsilon))).toBe("3 values, 0.0489 … 0.141, mean 0.0994");
    expect(sampleSummary(imbalance.map((r) => r.eta))).toBe("3 values, all 0.05");
    expect(sampleSummary([])).toBe("none");
    expect(sampleSummary([-0.25])).toBe("1 value, all −0.25");
    expect(formatParam(2.5e-7)).toBe("2.5e−7");
    expect(coherentSamples(NS.meta.noise!)).toEqual({ overrotation: [], imbalance: [] });
  });

  it("tells stochastic, drawn, deterministic and ideal runs apart", () => {
    expect(noiseRandomness(NC)).toBe("drawn");
    expect(noiseSampleNote(NC)).toMatch(/drawn once/);
    expect(noiseRandomness(NS)).toBe("stochastic");
    expect(noiseSampleNote(NS)).toBe("This is one quantum-jump trajectory; the metrics below are for this sample.");
    expect(noiseRandomness(E2)).toBe("ideal");
    const fixed = { ...NC, config: { ...NC.config, noise: NC.config.noise!.map((e) => ({ ...e, sigma: 0 })) } };
    expect(noiseRandomness(fixed)).toBe("deterministic");
    expect(noiseSampleNote(fixed)).toMatch(/deterministic/);
    const mixed = {
      meta: { ...NC.meta, noise: { ...NC.meta.noise!, channels: [...NC.meta.noise!.channels, NS.meta.noise!.channels[0]!] } },
      config: { ...NC.config, noise: [...NC.config.noise!, NS.config.noise![0]!] },
    };
    expect(noiseRandomness(mixed)).toBe("stochastic");
    expect(noiseSampleNote(mixed)).toMatch(/one draw of the static miscalibrations/);
  });

  it("reports the discarded weight and the branches not stored", () => {
    expect(NC.final.metrics.discarded).toBeGreaterThan(0);
    expect(formatWeight(NC.final.metrics.discarded!)).toBe("0.0076");
    expect(formatWeight(0)).toBe("0");
    expect(formatWeight(1.234e-5)).toBe("1.2e−5");
    const om = NC.frames[5]!.omitted!;
    expect(NC.frames[5]!.branches).toHaveLength(4);
    expect(omittedText(om)).toBe("5 more branches with total weight 0.0276 are not stored in this trajectory");
    expect(omittedText({ count: 1, weight: 1e-5 })).toBe("1 more branch with total weight 1.0e−5 is not stored in this trajectory");
    expect(NC.frames[0]!.omitted).toBeUndefined();
  });

  it("labels the branches split off by coherent errors", () => {
    const labels = NC.meta.branch_labels;
    const inputs = NC.meta.input_normalised;
    expect(branchLabel(1, inputs, labels)).toBe("|11⟩");
    expect(branchLabel(2, inputs, labels)).toBe("|11⟩′1");
    expect(NC.final.readout.map((r) => branchLabel(r.id, inputs, labels))).toContain("|00⟩′1");
    expect(branchLabel(1, inputs)).toBe("|11⟩");
    expect(branchLabel(999, inputs, labels)).toBe("#999");
  });
});
