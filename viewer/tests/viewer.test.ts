import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { computeLayout, DEFAULT_LAYOUT, edgeKey } from "../src/layout/unfoldedH";
import { windowGroups } from "../src/layout/gates";
import { formatAmp, ketText, phaseDeg } from "../src/layout/kets";
import { checkTrajectory, type Trajectory } from "../src/model/types";
import { drawFrame } from "../src/playback/render";
import { nextStop, phaseBands, prevStop, stops } from "../src/playback/steps";

function load(path: string): Trajectory {
  return checkTrajectory(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8")));
}

const E1 = load("../../engine/tests/golden/E1.traj.json");
const E2 = load("./fixtures/E2.traj.json");
const E1S = load("./fixtures/E1-switch.traj.json");

describe("ket formatting matches the engine (PROTOCOL.md §6)", () => {
  it("prints the E1 checkpoints exactly like `qramsim run --print-kets`", () => {
    const kets = Object.fromEntries(
      E1.final.checkpoints!.map((c) => [c.name, c.branches.map((b) => ketText(b, E1.meta.slots))]),
    );
    expect(kets["ψ_in"]).toEqual(["|R^{1,1}⟩_{D1} |R^{1,1}⟩_{D0} |∅^{1}⟩_{A2} |R^{1,1}⟩_{A1}"]);
    expect(kets["ψ_1"]).toEqual(["|B^{1,1}⟩_{D1} |B^{1,1}⟩_{D0} |∅^{1}⟩_{A2} |R^{1,1}⟩_{A1}"]);
    expect(kets["ψ_4"]).toEqual(["|R^{3,3}⟩_{D1} |R^{3,3}⟩_{D0} |∅^{3}⟩_{A2} |R^{3,1}⟩_{A1}"]);
    expect(kets["ψ_7"]).toEqual(["|B^{1',1}⟩_{D1} |B^{1',1}⟩_{D0} |∅^{1'}⟩_{A2} |R^{1',1}⟩_{A1}"]);
    expect(kets["output"]).toEqual(["|R^{out}⟩_{D1} |R^{out}⟩_{D0} |∅^{out}⟩_{A2} |R^{out}⟩_{A1}"]);
  });

  it("prints the E2 output in both orders", () => {
    const last = E2.frames[E2.frames.length - 1]!;
    const texts = last.branches.map((b) => ketText(b, E2.meta.slots));
    expect(texts).toEqual([
      "|R^{out}⟩_{D1} |R^{out}⟩_{D0} |∅^{out}⟩_{A2} |∅^{out}⟩_{A1}",
      "|∅^{out}⟩_{D1} |R^{out}⟩_{D0} |R^{out}⟩_{A2} |R^{out}⟩_{A1}",
    ]);
    expect(ketText(last.branches[1]!, E2.meta.slots, "train")).toBe(
      "|R^{out}⟩_{A1} |R^{out}⟩_{A2} |R^{out}⟩_{D0} |∅^{out}⟩_{D1}",
    );
  });

  it("formats amplitudes and phases", () => {
    expect(formatAmp([Math.SQRT1_2, 0])).toBe("0.7071");
    expect(formatAmp([0, 0.5])).toBe("0.5000·e^{i90°}");
    expect(formatAmp([-1, 0])).toBe("−1.0000");
    expect(phaseDeg([0, -1])).toBeCloseTo(270);
  });
});

describe("unfolded-H layout", () => {
  const L = computeLayout(E2.meta, DEFAULT_LAYOUT);

  it("places every edge, node and cell", () => {
    expect(L.edges.size).toBe(1 + 2 + 4);
    expect(L.nodes.length).toBe(3);
    expect(L.cells.map((c) => c.address)).toEqual(["00", "01", "10", "11"]);
    for (const e of L.edges.values()) {
      const n = e.d <= E2.meta.n ? E2.meta.geometry.levels[e.d - 1]!.n_sites : E2.meta.geometry.memory_sites;
      expect(e.sites.length).toBe(n);
    }
  });

  it("orders cells top to bottom and sends left children up", () => {
    const y = (d: number, l: number) => L.edges.get(edgeKey(d, l))!.sites.at(-1)!.y;
    expect(y(3, 1)).toBeLessThan(y(3, 2));
    expect(y(2, 1)).toBeLessThan(y(2, 2));
    // sites advance left → right along the path
    const e = L.edges.get(edgeKey(1, 1))!;
    expect(e.sites[1]!.x).toBeGreaterThan(e.sites[0]!.x);
  });

  it("mirrors walkers moving backward across the cell column", () => {
    const fwd = L.place([2, 2, 1], 1);
    const bwd = L.place([2, 2, 1], -1);
    expect(bwd.y).toBe(fwd.y);
    expect((fwd.x + bwd.x) / 2).toBeCloseTo(L.xCells);
    const flat = computeLayout(E2.meta, { ...DEFAULT_LAYOUT, mirror: false });
    expect(flat.place([2, 2, 1], -1)).toEqual(flat.place([2, 2, 1], 1));
    // the port queue: waiting walkers on the left, exited walkers on the right
    expect(L.place([0, 1, -2], 1).x).toBeLessThan(L.xRoot);
    expect(L.place([0, 1, -2], -1).x).toBeGreaterThan(L.width - L.xRoot - 1);
  });
});

describe("step navigation (D6)", () => {
  const opts = { includeIdle: false };

  it("tick mode visits every frame", () => {
    expect(stops(E1, "tick", opts).length).toBe(E1.frames.length);
    expect(nextStop(E1, 0, "tick", opts)).toBe(1);
    expect(prevStop(E1, 5, "tick", opts)).toBe(4);
  });

  it("gate mode stops where a gate acted (E1: Û⁽¹⁾, copy, Û⁽¹⁾ again)", () => {
    const g = stops(E1, "gate", opts).filter((i) => i > 0 && i < E1.frames.length - 1);
    const fired = g.map((i) =>
      E1.frames[i]!.events.filter((e) => e.kind === "gate" && e.fired_in.length).map((e) => (e.kind === "gate" ? e.gate : "")),
    );
    expect(fired).toEqual([["U1"], ["copy_D1"], ["U1"]]);
    const withIdle = stops(E1, "gate", { includeIdle: true });
    expect(withIdle.length).toBeGreaterThan(stops(E1, "gate", opts).length);
  });

  it("level and phase modes", () => {
    const lv = stops(E2, "level", opts);
    for (const m of E2.meta.marks!.level) expect(lv).toContain(m.t + 1);
    const bands = phaseBands(E2);
    expect(bands.map((b) => b.phase)).toEqual(["init", "routing", "query", "inverse"]);
    expect(stops(E2, "phase", opts)).toEqual([0, ...bands.slice(1).map((b) => b.start), E2.frames.length - 1]);
  });
});

describe("frame drawing (data-only interpolation)", () => {
  const L = computeLayout(E1.meta, DEFAULT_LAYOUT);
  const u1 = E1.frames.findIndex((f) => f.events.some((e) => e.kind === "gate" && e.gate === "U1"));

  it("shows the post-gate colours at the start of a routing tick", () => {
    const early = drawFrame(E1, L, u1, 0.1, true)[0]!;
    const d1 = early.walkers.find((w) => w.k === 3)!;
    expect(d1.s).toBe("B");
    const before = drawFrame(E1, L, u1 - 1, 1, true)[0]!;
    expect(before.walkers.find((w) => w.k === 3)!.s).toBe("R");
  });

  it("draws ghosts only when asked and keeps one record per slot", () => {
    const withG = drawFrame(E1, L, 5, 1, true)[0]!;
    const noG = drawFrame(E1, L, 5, 1, false)[0]!;
    expect(withG.walkers.length).toBe(E1.meta.K);
    expect(noG.walkers.length).toBe(E1.meta.K - 1); // A_2 is empty in E1
  });

  it("reports cell switches in cell-switch mode", () => {
    const on = E1S.frames.findIndex((f) => f.branches.some((b) => (b.cells?.on.length ?? 0) > 0));
    expect(on).toBeGreaterThan(0);
    expect(drawFrame(E1S, computeLayout(E1S.meta), on, 1, true)[0]!.cellsOn).toEqual([3]);
  });
});

describe("backup variant (E3)", () => {
  const E3 = load("./fixtures/E3.traj.json");

  it("prints the arXiv level-1 chain result exactly like the engine", () => {
    const cp = E3.final.checkpoints!.find((c) => c.name === "ψ_1")!;
    expect(ketText(cp.branches[0]!, E3.meta.slots)).toBe(
      "|B^{1,1}⟩_{D2} |B^{1,1}⟩_{D̃1} |B^{1,1}⟩_{D1} |B^{1,1}⟩_{Ã2} |∅^{1}⟩_{A2} |B^{1,1}⟩_{Ã1} |R^{1,1}⟩_{A1}",
    );
  });

  it("has one window per gate type and level: Û_in on sites 2–3, Û_B on 2–4", () => {
    const groups = windowGroups(E3.meta);
    expect(groups.map((g) => [g.type, g.level, g.sites])).toEqual([
      ["U_in", 1, [2, 3]],
      ["U_B", 1, [2, 4]],
      ["U_in", 2, [2, 3]],
      ["U_B", 2, [2, 4]],
    ]);
  });

  it("has gates of two levels in the same tick (pipelining)", () => {
    const concurrent = E3.frames.filter((f) => {
      const levels = new Set(f.events.flatMap((e) => (e.kind === "gate" ? [e.level] : [])));
      return levels.size >= 2;
    });
    // Û_B⁽¹⁾[D̃₁] with Û_in⁽²⁾, forward and in the time-reversed inverse routing
    expect(concurrent.map((f) => f.t)).toEqual([9, 22]);
  });
});

describe("noisy trajectories (D21, D26)", () => {
  const NS = load("./fixtures/noise-stray.traj.json");
  const NL = load("./fixtures/noise-loss.traj.json");

  it("draws the stray walker and the collision", () => {
    const L = computeLayout(NS.meta);
    const withStray = NS.frames.findIndex((f) => (f.branches[0]!.strays ?? []).length > 0);
    expect(withStray).toBeGreaterThan(0);
    const drawn = drawFrame(NS, L, withStray, 1, true)[0]!;
    expect(drawn.strays).toHaveLength(1);
    expect(NS.meta.slots[drawn.strays[0]!.k]!.name).toBe("D_1");
    const collidedAt = NS.frames.findIndex((f) => f.branches[0]!.collided);
    const atCollision = drawFrame(NS, L, collidedAt, 1, true)[0]!;
    expect(atCollision.collided).toBe(true);
    // one physical site, marked at both its drawings in the unfolded view
    expect(atCollision.clashes).toHaveLength(2);
    // frozen: nothing moves after the collision
    const last = drawFrame(NS, L, NS.frames.length - 1, 1, true)[0]!;
    expect(last.walkers.map((w) => w.p)).toEqual(atCollision.walkers.map((w) => w.p));
  });

  it("shows a lost walker as a ghost after the loss event", () => {
    const L = computeLayout(NL.meta);
    const i = NL.frames.findIndex((f) => f.events.some((e) => e.kind === "noise" && e.model === "loss"));
    const after = drawFrame(NL, L, i, 1, true)[0]!;
    const d1 = after.walkers.find((w) => NL.meta.slots[w.k]!.name === "D_1")!;
    expect(d1.ghost).toBe(true);
    expect(NL.meta.noise!.memory_flips.length).toBeGreaterThan(0);
  });
});
