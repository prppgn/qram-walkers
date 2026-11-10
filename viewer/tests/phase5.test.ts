// Exports and comparison (PLAN.md Phase 5): the clock of the video and of the comparison,
// captions, CSV, TikZ, the vertical orientation and the configuration of a comparison.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { comparisonConfig, defaultPartner, noiseDropped } from "../src/components/compareModel";
import { VARIANTS } from "../src/components/setup/configModel";
import { eventsCsv } from "../src/export/tables";
import { tikzFrame } from "../src/export/tikz";
import { captionAt, instantAt, videoPosition } from "../src/export/video";
import { computeLayout, DEFAULT_LAYOUT, edgeKey } from "../src/layout/unfoldedH";
import { checkTrajectory, type NoiseEntryJSON, type Trajectory } from "../src/model/types";
import { drawFrame } from "../src/playback/render";

function load(path: string): Trajectory {
  return checkTrajectory(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8")));
}

const E2 = load("./fixtures/E2.traj.json");
const DB = load("./fixtures/dualrail-backup.traj.json");
const QS = load("./fixtures/qudit-short.traj.json");
const NL = load("./fixtures/noise-loss.traj.json");

describe("clock", () => {
  it("maps a clock position to a frame and its progress", () => {
    expect(instantAt(0, 10)).toEqual({ frame: 0, progress: 1 });
    expect(instantAt(1, 10)).toEqual({ frame: 1, progress: 1 });
    expect(instantAt(2.25, 10)).toEqual({ frame: 3, progress: 0.25 });
    expect(instantAt(99, 10)).toEqual({ frame: 10, progress: 1 });
  });

  it("holds the ends of a video and moves forward in between", () => {
    const total = 600;
    const last = 23;
    expect(videoPosition(0, total, last, 30, 30)).toEqual({ frame: 0, progress: 1 });
    expect(videoPosition(30, total, last, 30, 30)).toEqual({ frame: 0, progress: 1 });
    expect(videoPosition(total - 1, total, last, 30, 30)).toEqual({ frame: last, progress: 1 });
    expect(videoPosition(total - 31, total, last, 30, 30)).toEqual({ frame: last, progress: 1 });
    let previous = -1;
    for (let i = 0; i < total; i++) {
      const { frame, progress } = videoPosition(i, total, last, 30, 30);
      const p = frame - 1 + progress;
      expect(p).toBeGreaterThanOrEqual(previous - 1e-9);
      previous = p;
    }
  });

  it("captions a frame with its most telling event, and keeps it until the next one", () => {
    const fired = E2.frames.findIndex((f) => f.events.some((e) => e.kind === "gate" && e.fired_in.length > 0));
    expect(captionAt(E2, fired)).toMatch(/^Û/);
    expect(captionAt(E2, 0)).toMatch(/input|train/i);
    const quiet = E2.frames.findIndex((f, i) => i > 0 && f.events.length === 0);
    if (quiet > 0) expect(captionAt(E2, quiet)).toBe(captionAt(E2, quiet - 1));
    for (let i = 0; i < E2.frames.length; i++) expect(captionAt(E2, i).length).toBeGreaterThan(0);
  });
});

describe("events CSV", () => {
  it("has the columns of `qramsim export --format csv-events`, quoted where needed", () => {
    const rows = eventsCsv(E2).trim().split("\r\n");
    expect(rows[0]).toBe("t,kind,gate,phase,k,fired_in,text");
    expect(rows.length).toBe(1 + E2.frames.reduce((a, f) => a + f.events.length, 0));
    expect(rows.some((r) => /^\d+,gate,U1,routing,,/.test(r))).toBe(true);
    expect(rows.some((r) => r.includes('"'))).toBe(true); // sentences contain commas
  });
});

describe("vertical orientation", () => {
  const h = computeLayout(E2.meta, DEFAULT_LAYOUT);
  const v = computeLayout(E2.meta, { ...DEFAULT_LAYOUT, orientation: "vertical" });

  it("swaps the axes of the same construction", () => {
    expect(v.width).toBe(h.height);
    expect(v.height).toBe(h.width);
    const pos: [number, number, number] = [2, 2, 1];
    expect(v.physical(pos)).toEqual({ x: h.physical(pos).y, y: h.physical(pos).x });
    expect(v.root.y).toBeLessThan(v.height / 2); // root on top
  });

  it("keeps the left child on the left and mirrors the output tree downwards", () => {
    const left = v.edges.get(edgeKey(2, 1))!.sites[0]!;
    const right = v.edges.get(edgeKey(2, 2))!.sites[0]!;
    expect(left.x).toBeLessThan(right.x);
    const up = v.place([1, 1, 1], 1);
    const back = v.place([1, 1, 1], -1);
    expect(back.x).toBe(up.x);
    expect(back.y).toBeGreaterThan(up.y);
  });

  it("stacks the dual-rail trees side by side", () => {
    const two = computeLayout(DB.meta, { ...DEFAULT_LAYOUT, orientation: "vertical" });
    const a = two.place([1, 1, 1], 1, 0);
    const b = two.place([1, 1, 1], 1, 1);
    expect(b.y).toBe(a.y);
    expect(b.x - a.x).toBe(two.treeShift(1));
    expect(two.treeTransform(1)).toBe(`translate(${two.treeShift(1)},0)`);
  });
});

describe("TikZ", () => {
  const frame = (t: Trajectory, i: number) => {
    const L = computeLayout(t.meta, DEFAULT_LAYOUT);
    return tikzFrame(t, L, drawFrame(t, L, i, 1, true), i);
  };

  it("writes a standalone document with the tree, the cells and the walkers", () => {
    const tex = frame(E2, 6); // the whole train on the tree (in a cell, walkers are not drawn)
    expect(tex).toContain("\\documentclass[tikz");
    expect(tex).toContain("\\begin{tikzpicture}");
    expect(tex).toContain("\\end{document}");
    expect(tex.match(/\\node\[snode\]/g)).toHaveLength(6); // 3 nodes, input and output trees
    expect(tex.match(/\\draw\[cell\]/g)).toHaveLength(4);
    expect(tex).toContain("$A_{1}$");
    expect(tex).toContain("\\hat U^{(1)}");
    expect(tex).toContain("ghost"); // the empty slots of branch |00⟩
    expect(tex).not.toMatch(/NaN|undefined/);
  });

  it("labels dual-rail backups with their rail and draws both trees", () => {
    const tex = frame(DB, 6);
    expect(tex).toContain("\\tilde{A}_{1}^{\\uparrow}");
    expect(tex).toContain("\\tilde{D}_{1}^{\\downarrow}");
    expect(tex.match(/\\draw\[cell\]/g)).toHaveLength(8);
    expect(tex).not.toMatch(/NaN|undefined/);
  });

  it("draws stray walkers and collisions", () => {
    const NS = load("./fixtures/noise-stray.traj.json");
    const L = computeLayout(NS.meta, DEFAULT_LAYOUT);
    // a stray on the tree (one in a memory lane is inside its cell and not drawn)
    const withStray = NS.frames.findIndex((f) => f.branches.some((b) => (b.strays ?? []).some((st) => st.pos[0] <= NS.meta.n)));
    expect(withStray).toBeGreaterThan(0);
    expect(tikzFrame(NS, L, drawFrame(NS, L, withStray, 1, true), withStray)).toContain("\\node[strayring]");
    const clash = NS.frames.findIndex((_, i) => drawFrame(NS, L, i, 1, true).some((b) => b.clashes.length > 0));
    expect(clash).toBeGreaterThan(0);
    expect(tikzFrame(NS, L, drawFrame(NS, L, clash, 1, true), clash)).toContain("\\node[clash]");
  });

  it("draws a qudit ○ hollow", () => {
    expect(frame(QS, 1)).toMatch(/draw=qred,fill=white/);
  });
});

describe("comparison", () => {
  it("offers a natural partner for every variant", () => {
    for (const v of VARIANTS) {
      expect(defaultPartner(v.id)).not.toBe(v.id);
      expect(VARIANTS.map((x) => x.id)).toContain(defaultPartner(v.id));
    }
  });

  it("keeps input and memory, adapts the copy mode", () => {
    const cfg = comparisonConfig(E2, "dualrail_backup");
    expect(cfg.variant).toBe("dualrail_backup");
    expect(cfg.copy_mode).toBe("backup");
    expect(cfg.input).toEqual(E2.config.input);
    expect(cfg.memory).toEqual(E2.config.memory);
    expect(comparisonConfig(E2, "qudit_long").copy_mode).toBe("global");
  });

  it("carries the noise over, adapting what depends on the walker family (D35)", () => {
    expect(NL.config.noise?.length).toBeGreaterThan(0);
    expect(comparisonConfig(NL, "qudit_long").noise).toEqual(NL.config.noise);
    expect(noiseDropped(NL, "qudit_long")).toBe(false);
    expect(noiseDropped(E2, "qudit_long")).toBe(false);
    const withNoise = (noise: NoiseEntryJSON[], variant = "basic"): Trajectory => ({
      ...E2,
      config: { ...E2.config, variant, noise },
    });
    const dephased = withNoise([{ model: "presence_dephasing", p: 0.1 }]);
    expect(comparisonConfig(dephased, "dualrail_basic").noise).toEqual([{ model: "logical_dephasing", p: 0.1 }]);
    expect(comparisonConfig(dephased, "backup").noise).toEqual([{ model: "presence_dephasing", p: 0.1 }]);
    const flipped = withNoise(
      [
        { model: "logical_flip", p: 0.1 },
        { model: "depolarizing", p: 0.1, on: "both" },
      ],
      "qudit_long",
    );
    expect(comparisonConfig(flipped, "basic").noise).toEqual([{ model: "depolarizing", p: 0.1 }]);
    expect(noiseDropped(flipped, "basic")).toBe(true);
    expect(comparisonConfig(flipped, "dualrail_basic").noise).toEqual(flipped.config.noise);
    expect(noiseDropped(flipped, "dualrail_basic")).toBe(false);
    const vacuum = withNoise([{ model: "overrotation", epsilon: 0.1, vacuum_phase: true }]);
    expect(comparisonConfig(vacuum, "qudit_short").noise).toEqual([{ model: "overrotation", epsilon: 0.1 }]);
  });
});
