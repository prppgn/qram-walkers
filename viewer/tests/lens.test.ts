// The cell swallows the train: lane sites inside the cell boxes, the turn hidden in the
// box, cells lit by the branches that reached them, and the cell lens (its geometry, the
// walkers it shows, the copy flashes). Data-only: the positions come from the frames.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { lensGeometry, lensRect, lensScene, sceneBounds } from "../src/layout/lens";
import { cellBoxes, computeLayout, DEFAULT_LAYOUT, edgeKey, longestStep, type Layout } from "../src/layout/unfoldedH";
import { restSite } from "../src/model/states";
import { checkTrajectory, type Trajectory } from "../src/model/types";
import { cellLights, cellTargets, hasLens, lensCells } from "../src/playback/cells";
import { drawFrame } from "../src/playback/render";

function load(path: string): Trajectory {
  return checkTrajectory(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8")));
}

const E1 = load("../../engine/tests/golden/E1.traj.json");
const E2 = load("./fixtures/E2.traj.json");
const E1S = load("./fixtures/E1-switch.traj.json");
const E3 = load("./fixtures/E3.traj.json");
const DR = load("./fixtures/dualrail.traj.json");
const DB = load("./fixtures/dualrail-backup.traj.json");
const QS = load("./fixtures/qudit-short.traj.json");
const ALL = { E1, E2, E1S, E3, DR, DB, QS };

const R = 7; // walker radius on the tree
const inside = (p: { x: number; y: number }, b: { x: number; y: number; w: number; h: number }, margin: number) =>
  p.x - margin >= b.x - 1e-9 && p.x + margin <= b.x + b.w + 1e-9 && p.y >= b.y - 1e-9 && p.y <= b.y + b.h + 1e-9;
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

function layouts(t: Trajectory): [string, Layout][] {
  const out: [string, Layout][] = [];
  for (const orientation of ["horizontal", "vertical"] as const)
    for (const mirror of [true, false]) out.push([`${orientation}, mirror ${mirror}`, computeLayout(t.meta, { ...DEFAULT_LAYOUT, orientation, mirror })]);
  return out;
}

describe("the lane ends inside the cell", () => {
  for (const [name, t] of Object.entries(ALL)) {
    for (const [how, L] of layouts(t)) {
      it(`${name} (${how}): every lane site, drawn either way, is hidden in its cell box`, () => {
        const lane = t.meta.n + 1;
        const vertical = L.opts.orientation === "vertical";
        const boxes = cellBoxes(L);
        for (const c of L.cells) {
          for (let tree = 0; tree < L.trees; tree++) {
            const box = boxes.find((b) => b.l === c.l && b.tree === tree)!;
            for (let s = 1; s <= t.meta.geometry.memory_sites; s++) {
              for (const dir of [1, -1]) {
                const p = L.place([lane, c.l, s], dir, tree);
                // along the lane the whole disc is in the box; across it, the centre is
                const q = vertical ? { x: p.y, y: p.x } : p;
                const b = vertical ? { x: box.y, y: box.x, w: box.h, h: box.w } : box;
                expect(inside(q, b, R)).toBe(true);
              }
            }
            if (tree === 1) {
              // the auxiliary rail of the dual-rail output circuit stays in the ↓ box too
              const aux = L.place([lane, c.l, 1], 1, 2);
              const q = vertical ? { x: aux.y, y: aux.x } : aux;
              const b = vertical ? { x: box.y, y: box.x, w: box.h, h: box.w } : box;
              expect(q.y - R).toBeGreaterThanOrEqual(b.y - 1e-9);
            }
          }
        }
      });
    }
  }

  it("draws the lane as a stub from the last node to the face of the cell", () => {
    for (const [, L] of layouts(E2)) {
      const vertical = L.opts.orientation === "vertical";
      for (const c of L.cells) {
        const e = L.edges.get(edgeKey(E2.meta.n + 1, c.l))!;
        const end = e.path.at(-1)!;
        const face = vertical ? { x: c.box.x + c.box.w / 2, y: c.box.y } : { x: c.box.x, y: c.box.y + c.box.h / 2 };
        expect(end.x).toBeCloseTo(face.x);
        expect(end.y).toBeCloseTo(face.y);
        // the stub is one site pitch long along the tree
        const start = e.path[0]!;
        expect(Math.abs(vertical ? end.y - start.y : end.x - start.x)).toBeCloseTo(L.opts.sitePitch);
      }
    }
  });

  it("hides the turn: a lane site and its mirror image are in the same box, the deepest one does not move", () => {
    const L = computeLayout(E2.meta, DEFAULT_LAYOUT);
    const N = E2.meta.geometry.memory_sites;
    const deep = [L.place([3, 2, N], 1), L.place([3, 2, N], -1)];
    expect(deep[0]!.x).toBeCloseTo(L.xCells);
    expect(deep[1]!.x).toBeCloseTo(L.xCells);
    const slide = dist(L.place([3, 2, 1], 1), L.place([3, 2, 1], -1));
    expect(slide).toBeLessThan(L.cellWidth);
    expect(slide).toBeLessThanOrEqual(longestStep(L));
  });

  it("the longest hop between neighbouring sites is the one into a cell, down from the last node", () => {
    for (const t of [E1, E2]) {
      for (const [, L] of layouts(t)) {
        const step = longestStep(L);
        const lane = t.meta.n + 1;
        const levelN = t.meta.geometry.levels[t.meta.n - 1]!.n_sites;
        const into = dist(L.place([t.meta.n, 1, levelN], 1), L.place([lane, 1, 1], 1));
        expect(step).toBeCloseTo(into);
        expect(step).toBeLessThanOrEqual(3 * L.opts.sitePitch);
      }
    }
  });
});

describe("interpolation through the turn", () => {
  for (const [name, t] of Object.entries({ E1, E2 })) {
    it(`${name}: no walker moves more than one step in a tick, nor jumps within it`, () => {
      const L = computeLayout(t.meta, DEFAULT_LAYOUT);
      const step = longestStep(L) + 1e-6;
      const key = (b: number, k: number) => `${b}:${k}`;
      let last = new Map<string, { x: number; y: number }>();
      const SUB = 10;
      for (let i = 1; i < t.frames.length; i++) {
        for (let j = 1; j <= SUB; j++) {
          const now = new Map<string, { x: number; y: number }>();
          for (const b of drawFrame(t, L, i, j / SUB, true)) for (const w of b.walkers) now.set(key(b.id, w.k), w.p);
          for (const [k, p] of now) {
            const q = last.get(k);
            if (q) expect(dist(p, q)).toBeLessThanOrEqual(step / SUB + 1e-6);
          }
          last = now;
        }
      }
    });
  }
});

describe("cells lit by the branches that reached them", () => {
  it("finds the cell of each branch from its data walkers at the query", () => {
    expect([...cellTargets(E2)].sort()).toEqual([
      [0, 1],
      [1, 4],
    ]);
    expect([...cellTargets(E1)]).toEqual([[0, 3]]);
    expect([...cellTargets(DR).values()].length).toBe(DR.frames[0]!.branches.length);
  });

  it("E2: both cells light when the first walker enters, each with its branch weight", () => {
    const first = 10; // D₀ enters the lanes of cells 1 and 4 in the tick that ends at frame 10
    expect(cellLights(E2, first - 1, 1).filter((c) => c.lit > 0)).toEqual([]);
    const mid = cellLights(E2, first, 0.5).filter((c) => c.lit > 0);
    expect(mid.map((c) => c.l).sort()).toEqual([1, 4]);
    for (const c of mid) expect(c.lit).toBeCloseTo(0.25);
    const query = cellLights(E2, 12, 1);
    const lit = (l: number) => query.find((c) => c.l === l)!;
    expect(lit(1).lit).toBeCloseTo(0.5);
    expect(lit(4).lit).toBeCloseTo(0.5);
    // A₂ of the |11⟩ branch is dispersed into cell 3 (10): faint, grey
    expect(lit(3).lit).toBe(0);
    expect(lit(3).grey).toBeCloseTo(0.5);
    // walkers inside: D₀ and D₁ in cell 1; in cell 4 D₁ became |∅⟩ at the copy
    expect(lit(1).count).toBe(2);
    expect(lit(4).count).toBe(1);
    expect(cellLights(E2, E2.frames.length - 1, 1).filter((c) => c.lit > 0 || c.grey > 0)).toEqual([]);
  });

  it("E1: the cell of A₁ alone is grey; the addressed cell lights when the train enters it", () => {
    const at = (i: number, l: number) => cellLights(E1, i, 1).find((c) => c.l === l)!;
    expect(at(8, 1).grey).toBeGreaterThan(0);
    expect(at(8, 1).lit).toBe(0);
    const enter = E1.frames.findIndex((f) => f.branches[0]!.walkers.some((w) => w.s !== "E" && w.pos?.[0] === 3 && w.pos[1] === 3));
    expect(at(enter - 1, 3).lit).toBe(0);
    expect(at(enter, 3).lit).toBe(1);
    expect(hasLens(E1)).toBe(true);
  });

  it("orders the lens cells by weight", () => {
    const bent = structuredClone(E2);
    for (const f of bent.frames) for (const b of f.branches) b.amp = b.id === 1 ? [0.8, 0] : [0.6, 0];
    const cells = lensCells(bent, 12, 1);
    expect(cells.map((c) => c.l)).toEqual([4, 1]);
    expect(cells[0]!.weight).toBeCloseTo(0.64);
    expect(cells[0]!.branches).toEqual([1]);
  });
});

describe("the cell lens", () => {
  it("lays out the lane with its sites at the tree's scale and the m memory qubits beside the data", () => {
    for (const t of [E1, E2, E3, QS]) {
      const g = lensGeometry(t.meta, DEFAULT_LAYOUT.sitePitch, false);
      const N = t.meta.geometry.memory_sites;
      expect(g.siteX(2) - g.siteX(1)).toBeCloseTo(DEFAULT_LAYOUT.sitePitch);
      expect(g.siteX(1)).toBeGreaterThan(g.entryX);
      expect(g.siteX(N)).toBeLessThan(g.w);
      expect(g.memory.length).toBe(t.meta.m);
      for (const q of g.memory) expect(q.x).toBeCloseTo(g.siteX(restSite(t.meta, q.k)));
    }
    const dual = lensGeometry(DR.meta, DEFAULT_LAYOUT.sitePitch, false);
    expect(dual.rows.map((r) => r.tree)).toEqual([0, 2, 1]);
    // the rail names sit past the deep end, inside the frame
    expect(dual.laneEnd + 8 + 20).toBeLessThan(dual.w);
    const sw = lensGeometry(E1S.meta, DEFAULT_LAYOUT.sitePitch, false);
    expect(sw.lamp).not.toBeNull();
    // the gate caption has a row of its own, below the memory and switch labels
    for (const g of [sw, dual]) {
      const labels = Math.max(...g.memory.map((q) => q.y + 25), g.lamp ? g.lamp.y + 18 : 0);
      expect(g.caption).toBeGreaterThanOrEqual(labels + 12);
      expect(g.caption).toBeLessThan(g.h - 4);
    }
    expect(lensGeometry(E2.meta, DEFAULT_LAYOUT.sitePitch, true).h).toBeGreaterThan(lensGeometry(E2.meta, DEFAULT_LAYOUT.sitePitch, false).h);
  });

  it("shows the walkers of the cell in lane order, tail on the entrance side", () => {
    const g = lensGeometry(E1.meta, DEFAULT_LAYOUT.sitePitch, false);
    const scene = lensScene(E1, 12, 1, 3, true, g);
    const xs = scene.walkers.slice().sort((a, b) => a.p.x - b.p.x);
    expect(xs.map((w) => w.k)).toEqual([3, 2, 1]); // D₁, D₀, then the ghost of A₂ (A₁ went to cell 1)
    expect(xs.find((w) => w.k === 1)!.ghost).toBe(true);
  });

  it("brings each walker in from the entrance in the tick it vanishes into the cell", () => {
    const g = lensGeometry(E2.meta, DEFAULT_LAYOUT.sitePitch, false);
    const before = lensScene(E2, 9, 1, 4, true, g);
    expect(before.walkers.filter((w) => !w.ghost)).toEqual([]);
    const sliding = lensScene(E2, 10, 0.5, 4, true, g).walkers.find((w) => w.k === 2)!;
    expect(sliding.p.x).toBeGreaterThan(g.entryX);
    expect(sliding.p.x).toBeLessThan(g.siteX(1));
    const there = lensScene(E2, 10, 1, 4, true, g).walkers.find((w) => w.k === 2)!;
    expect(there.p.x).toBeCloseTo(g.siteX(1));
  });

  it("flashes the copy on (M_j, D_j) and turns D_j into a ghost where b_j = 0", () => {
    const g = lensGeometry(E2.meta, DEFAULT_LAYOUT.sitePitch, false);
    const q = lensScene(E2, 12, 1, 4, true, g);
    expect(q.flashes.length).toBe(1);
    expect(q.flashes[0]!.links.some((k) => k.from === "M1")).toBe(true);
    expect(q.walkers.find((w) => w.k === 3)!.ghost).toBe(true); // b = 0 in cell 4
    expect(lensScene(E2, 12, 1, 1, true, g).walkers.find((w) => w.k === 3)!.ghost).toBe(false); // b = 1 in cell 1
    expect(lensScene(E2, 11, 1, 4, true, g).flashes).toEqual([]);
  });

  it("retraces the lane after the turn: the train leaves through the entrance, tail first", () => {
    const g = lensGeometry(E2.meta, DEFAULT_LAYOUT.sitePitch, false);
    const out = lensScene(E2, 13, 0.5, 1, true, g).walkers.find((w) => w.k === 3)!; // D₁ of |00⟩, the tail
    expect(out.p.x).toBeLessThan(g.siteX(1));
    expect(lensScene(E2, 13, 1, 1, true, g).walkers.find((w) => w.k === 3)).toBeUndefined();
    // at the turn itself nothing moves in the lens
    const a = lensScene(E2, 12, 0.3, 1, true, g).walkers;
    const b = lensScene(E2, 12, 1, 1, true, g).walkers;
    for (const w of b) expect(a.find((x) => x.k === w.k && x.branch === w.branch)!.p).toEqual(w.p);
  });

  it("moves the walkers between the rails of the dual-rail output circuit", () => {
    const g = lensGeometry(DR.meta, DEFAULT_LAYOUT.sitePitch, false);
    const target = cellTargets(DR).get(1)!; // |11⟩: its D₁ reads b = 1 and changes rail
    const rowsSeen = new Set<number>();
    for (let i = 0; i < DR.frames.length; i++) for (const w of lensScene(DR, i, 1, target, true, g).walkers) rowsSeen.add(w.p.y);
    expect(rowsSeen.size).toBe(3);
  });

  it("sits below a wide drawing (beside a tall one), scales from its top-left corner, and joins the bounds", () => {
    const g = lensGeometry(E2.meta, DEFAULT_LAYOUT.sitePitch, true);
    for (const orientation of ["horizontal", "vertical"] as const) {
      const layout = computeLayout(E2.meta, { ...DEFAULT_LAYOUT, orientation });
      const r = lensRect(layout, g, { dx: 0, dy: 0, scale: 1 });
      if (layout.width >= layout.height) expect(r.y).toBeGreaterThan(layout.height);
      else expect(r.x).toBeGreaterThan(layout.width);
      const big = lensRect(layout, g, { dx: 5, dy: -3, scale: 2 });
      expect([big.x, big.y]).toEqual([r.x + 5, r.y - 3]);
      expect([big.w, big.h]).toEqual([2 * g.w, 2 * g.h]);
      const all = sceneBounds(layout, big);
      expect(all.x).toBeLessThanOrEqual(Math.min(0, big.x));
      expect(all.x + all.w).toBeGreaterThanOrEqual(big.x + big.w);
      expect(all.y + all.h).toBeGreaterThanOrEqual(big.y + big.h);
      expect(sceneBounds(layout, null)).toEqual({ x: 0, y: 0, w: layout.width, h: layout.height });
    }
  });
});

describe("TikZ of a frame with the train in its cells", () => {
  it("shades the lit cells and leaves out the walkers inside them", async () => {
    const { tikzFrame } = await import("../src/export/tikz");
    const L = computeLayout(E2.meta, DEFAULT_LAYOUT);
    const tex = tikzFrame(E2, L, drawFrame(E2, L, 12, 1, true), 12);
    expect(tex.match(/fill=qlit/g)).toHaveLength(2);
    expect(tex).not.toMatch(/\\node\[walker/);
    expect(tex).not.toMatch(/NaN|undefined/);
  });
});
