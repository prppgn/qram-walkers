// Which memory cells the train has reached, at an instant (data only, no physics).
//
// The cell of a branch is the one its data walkers sit in at the query. A cell lights
// with the weight |α|² of the branches whose walkers are in it and whose cell it is; it
// lights gradually during the tick in which the first of them slides in, and goes dark as
// the last one leaves. Where only dispersed address walkers rest, the cell is faint and
// grey. The tree draws the lights and a counter of the walkers inside; the cell lens
// shows the lit cells, heaviest first.
import { modulus } from "../layout/kets";
import { treeOf } from "../model/states";
import type { BranchJSON, Trajectory } from "../model/types";

export interface CellLight {
  l: number;
  /** Box of the cell: 0 = ↑ (or the only tree), 1 = ↓ (the auxiliary rail is drawn in it). */
  tree: number;
  /** Weight of the branches whose train is in this cell (0 … 1). */
  lit: number;
  /** Weight of the branches with only dispersed address walkers here. */
  grey: number;
  /** Walkers inside, in the heaviest branch whose cell this is (else the heaviest here). */
  count: number;
  /** Branches lighting the cell. */
  branches: number[];
}

export interface LensCell {
  l: number;
  /** Total |α|² of the branches whose train is in the cell. */
  weight: number;
  /** Those branches, heaviest first. */
  branches: number[];
}

const targetCache = new WeakMap<Trajectory, Map<number, number>>();
const lensCache = new WeakMap<Trajectory, boolean>();

function dataSlots(traj: Trajectory): number[] {
  return traj.meta.slots.flatMap((s, k) => (s.register === "D" ? [k] : []));
}

/** The lane holding most of the branch's data walkers (their ghosts if none is present). */
function dataCell(b: BranchJSON, data: number[], lane: number): number | null {
  const count = new Map<number, number>();
  for (const present of [true, false]) {
    for (const k of data) {
      const w = b.walkers[k];
      const pos = present ? (w && w.s !== "E" ? w.pos : undefined) : w?.ghost?.pos;
      if (pos && pos[0] === lane) count.set(pos[1], (count.get(pos[1]) ?? 0) + 1);
    }
    if (count.size) break;
  }
  let best: number | null = null;
  for (const [l, c] of count) if (best === null || c > count.get(best)! || (c === count.get(best)! && l < best)) best = l;
  return best;
}

/** The cell reached by each branch: where its data walkers are at the query. */
export function cellTargets(traj: Trajectory): Map<number, number> {
  const hit = targetCache.get(traj);
  if (hit) return hit;
  const lane = traj.meta.n + 1;
  const data = dataSlots(traj);
  const out = new Map<number, number>();
  for (const f of traj.frames) {
    if (f.phase !== "query") continue;
    for (const b of f.branches) {
      if (out.has(b.id)) continue;
      const l = dataCell(b, data, lane);
      if (l !== null) out.set(b.id, l);
    }
  }
  targetCache.set(traj, out);
  return out;
}

/** Present walkers of a branch in each cell box ("tree:l" → how many). */
function occupancy(b: BranchJSON, lane: number): Map<string, number> {
  const out = new Map<string, number>();
  for (const w of b.walkers) {
    if (w.s === "E" || !w.pos || w.pos[0] !== lane) continue;
    const key = `${treeOf(w.s) === 0 ? 0 : 1}:${w.pos[1]}`;
    out.set(key, (out.get(key) ?? 0) + 1);
  }
  return out;
}

interface Presence {
  id: number;
  weight: number;
  target: number | null;
  /** Box key → presence in (0, 1] at this instant, and the count at the nearer frame. */
  boxes: Map<string, { presence: number; count: number }>;
}

function presences(traj: Trajectory, index: number, progress: number): Presence[] {
  const cur = traj.frames[index]!;
  const prev = index > 0 && progress < 1 ? traj.frames[index - 1]! : null;
  const lane = traj.meta.n + 1;
  const targets = cellTargets(traj);
  const data = dataSlots(traj);
  const total = cur.branches.reduce((a, b) => a + modulus(b.amp) ** 2, 0) || 1;
  return cur.branches.map((b) => {
    const now = occupancy(b, lane);
    const pb = prev?.branches.find((x) => x.id === b.id);
    const before = pb ? occupancy(pb, lane) : now;
    const boxes = new Map<string, { presence: number; count: number }>();
    for (const key of new Set([...now.keys(), ...before.keys()])) {
      const p1 = now.has(key) ? 1 : 0;
      const p0 = before.has(key) ? 1 : 0;
      const presence = prev ? p0 + (p1 - p0) * progress : p1;
      const count = (progress >= 0.5 || !prev ? now : before).get(key) ?? 0;
      if (presence > 0) boxes.set(key, { presence, count });
    }
    return { id: b.id, weight: modulus(b.amp) ** 2 / total, target: targets.get(b.id) ?? dataCell(b, data, lane), boxes };
  });
}

/** Every cell box at frame `index`, `progress` of the way from the previous frame. */
export function cellLights(traj: Trajectory, index: number, progress: number): CellLight[] {
  const trees = traj.meta.geometry.trees ?? 1;
  const out = new Map<string, CellLight & { countRank: number }>();
  for (let tree = 0; tree < trees; tree++)
    for (const c of traj.meta.geometry.cells) out.set(`${tree}:${c.l}`, { l: c.l, tree, lit: 0, grey: 0, count: 0, branches: [], countRank: -1 });
  for (const b of presences(traj, index, progress)) {
    for (const [key, { presence, count }] of b.boxes) {
      const e = out.get(key);
      if (!e) continue;
      const mine = e.l === b.target;
      if (mine) {
        e.lit += b.weight * presence;
        e.branches.push(b.id);
      } else {
        e.grey += b.weight * presence;
      }
      // the counter follows the heaviest branch whose cell this is, else the heaviest here
      const rank = (mine ? 2 : 0) + b.weight;
      if (count > 0 && rank > e.countRank) {
        e.count = count;
        e.countRank = rank;
      }
    }
  }
  return [...out.values()].map(({ countRank: _, ...c }) => c);
}

/** The cells shown by the lens at an instant: those holding a branch's train, heaviest first. */
export function lensCells(traj: Trajectory, index: number, progress: number): LensCell[] {
  const cells = new Map<number, { weight: number; branches: { id: number; weight: number }[] }>();
  for (const b of presences(traj, index, progress)) {
    if (b.target === null) continue;
    const here = [...b.boxes.keys()].some((key) => Number(key.split(":")[1]) === b.target);
    if (!here) continue;
    const c = cells.get(b.target) ?? { weight: 0, branches: [] };
    c.weight += b.weight;
    c.branches.push({ id: b.id, weight: b.weight });
    cells.set(b.target, c);
  }
  return [...cells.entries()]
    .map(([l, c]) => ({ l, weight: c.weight, branches: c.branches.sort((a, b) => b.weight - a.weight).map((x) => x.id) }))
    .sort((a, b) => b.weight - a.weight || a.l - b.l);
}

/** Whether the train ever reaches a cell in this run (then the lens has something to show). */
export function hasLens(traj: Trajectory): boolean {
  const hit = lensCache.get(traj);
  if (hit !== undefined) return hit;
  const yes = traj.frames.some((_, i) => lensCells(traj, i, 1).length > 0);
  lensCache.set(traj, yes);
  return yes;
}

const multiCache = new WeakMap<Trajectory, boolean>();

/** Whether the train is ever in two cells at once (a superposition): the lens has tabs. */
export function manyCells(traj: Trajectory): boolean {
  const hit = multiCache.get(traj);
  if (hit !== undefined) return hit;
  const yes = traj.frames.some((_, i) => lensCells(traj, i, 1).length > 1);
  multiCache.set(traj, yes);
  return yes;
}
