// What to draw between two frames (data-only interpolation, no physics).
//
// Frame i is the end of tick i − 1. During routing a tick is "gates, then motion": the
// colours recorded by the tick's gate events (`changes[].to`) apply from the start of
// the tick, and walkers then move; a walker crossing a bifurcation takes its new colour
// halfway. During inverse routing a tick is "motion, then gates": walkers move first
// (Ŝ† colours halfway), and the gate changes apply near the end. Query ticks only flip
// colours. All colours and positions come from frames and events. `walkerTicks` resolves
// the state of every walker at an instant; `drawFrame` places it on the tree, the cell lens
// in its own picture of the lane.
import type { BranchJSON, FrameJSON, LocalState, Pos, Trajectory } from "../model/types";
import { lerp, type Layout, type Point } from "../layout/unfoldedH";
import { treeOf } from "../model/states";

export interface DrawnWalker {
  k: number;
  branch: number;
  s: LocalState; // "E" → ghost
  p: Point;
  ghost: boolean;
  /** Direction after the tick (for labels / mirroring decisions). */
  dir: number;
  /** In a memory lane at the end of the tick: hidden in its cell on the tree. */
  inCell: boolean;
}

export interface DrawnStray {
  /** Time bin it shares (−1: none). */
  k: number;
  s: LocalState;
  p: Point;
  /** In a memory lane: hidden in its cell on the tree. */
  inCell: boolean;
}

export interface DrawnBranch {
  id: number;
  amp: [number, number];
  walkers: DrawnWalker[];
  cellsOn: number[];
  /** Walkers outside the train's slots (DECISION D21). */
  strays: DrawnStray[];
  /** Frozen after two walkers met on one site (DECISION D26). */
  collided: boolean;
  /** Points where two walkers of this branch share a site. */
  clashes: Point[];
}

const INVERSE_GATE_AT = 0.8;

type Slot = { s: LocalState; pos?: Pos; dir: number; ghost: boolean };

function slotOf(frame: FrameJSON, branchIndex: number, k: number): Slot | null {
  const b = frame.branches[branchIndex];
  const w = b?.walkers[k];
  if (!w) return null;
  if (w.s !== "E") return { s: w.s, pos: w.pos, dir: w.dir ?? 1, ghost: false };
  if (w.ghost) return { s: w.ghost.c, pos: w.ghost.pos, dir: w.ghost.dir, ghost: true };
  return { s: "E", dir: 1, ghost: true };
}

/** Local state of (branch id, slot) with the tick's gate changes applied (`to`) or undone (`from`). */
function gateState(frame: FrameJSON, id: number, k: number, which: "to" | "from"): LocalState | null {
  let found: LocalState | null = null;
  for (const e of frame.events) {
    if (e.kind !== "gate") continue;
    for (const c of e.changes) {
      if (c.b === id && c.k === k && !c.ghost) {
        found = which === "to" ? c.to : found ?? c.from;
      }
    }
  }
  return found;
}

/** Where a walker is at the end of a frame: position, direction and tree (rail). */
export interface Place {
  pos: Pos;
  dir: number;
  tree: 0 | 1 | 2;
}

/** One walker at an instant: its state, and the move it is making during the tick. */
export interface WalkerTick {
  k: number;
  /** State shown at this instant ("E": an empty slot, drawn as a ghost). */
  s: LocalState;
  ghost: boolean;
  now: Place;
  /** Where it was at the previous frame; null when there is no move to draw. */
  before: Place | null;
  /** Fraction of the move done (= progress of the tick). */
  f: number;
}

export interface BranchTick {
  id: number;
  amp: [number, number];
  record: BranchJSON;
  /** The same branch at the previous frame, when the instant is inside a tick. */
  previous: BranchJSON | null;
  walkers: WalkerTick[];
}

function placeOf(slot: Slot): Place | null {
  return slot.pos ? { pos: slot.pos, dir: slot.dir, tree: treeOf(slot.s) } : null;
}

/** The state of every walker of every branch at frame `index`, `progress` of the way from
 *  the previous frame (1: exactly the frame). Ghosts are left out unless `showGhosts`. */
export function walkerTicks(traj: Trajectory, index: number, progress: number, showGhosts: boolean): BranchTick[] {
  const cur = traj.frames[index]!;
  const prev = index > 0 && progress < 1 ? traj.frames[index - 1]! : null;
  return cur.branches.map((b, bi) => {
    const prevIndex = prev ? prev.branches.findIndex((pb) => pb.id === b.id) : -1;
    const walkers: WalkerTick[] = [];
    b.walkers.forEach((_, k) => {
      const now = slotOf(cur, bi, k);
      const at = now && placeOf(now);
      if (!now || !at) return;
      const before = prev && prevIndex >= 0 ? slotOf(prev, prevIndex, k) : null;
      let s: LocalState = now.ghost ? "E" : now.s;
      let from: Place | null = null;
      if (before && before.pos && progress < 1) {
        from = placeOf(before);
        // colour / presence during the tick
        const beforeState: LocalState = before.ghost ? "E" : before.s;
        if (cur.phase === "routing") {
          const post = gateState(cur, b.id, k, "to");
          if (progress < 0.5 && post !== null) s = post;
          else if (progress < 0.5) s = beforeState;
        } else if (cur.phase === "inverse") {
          const pre = gateState(cur, b.id, k, "from");
          if (progress < 0.5) s = beforeState;
          else if (progress < INVERSE_GATE_AT && pre !== null) s = pre;
        } else if (progress < 0.5) {
          s = beforeState;
        }
      }
      const ghost = s === "E";
      if (ghost && !showGhosts) return;
      walkers.push({ k, s, ghost, now: at, before: from, f: progress });
    });
    return {
      id: b.id,
      amp: b.amp,
      record: b,
      previous: prev && prevIndex >= 0 ? prev.branches[prevIndex]! : null,
      walkers,
    };
  });
}

export function drawFrame(
  traj: Trajectory,
  layout: Layout,
  index: number,
  progress: number,
  showGhosts: boolean,
): DrawnBranch[] {
  const lane = traj.meta.n + 1;
  return walkerTicks(traj, index, progress, showGhosts).map((tick) => {
    const b = tick.record;
    const walkers: DrawnWalker[] = tick.walkers.map((w) => {
      let p = layout.place(w.now.pos, w.now.dir, w.now.tree);
      if (w.before) {
        const from = layout.place(w.before.pos, w.before.dir, w.before.tree);
        // A change of rail (dual-rail output circuit) is a jump, drawn halfway through the
        // tick, between two cells. A change of direction in a lane (the turn at the end of
        // the query) slides the walker across its cell, out of sight; elsewhere it is a jump.
        const rail = w.before.tree !== w.now.tree;
        const turnedInLane = w.before.dir !== w.now.dir && w.before.pos[0] === lane && w.now.pos[0] === lane;
        const jump = rail || (w.before.dir !== w.now.dir && !turnedInLane);
        p = jump ? (progress < 0.5 ? from : p) : lerp(from, p, progress);
      }
      return { k: w.k, branch: b.id, s: w.s, p, ghost: w.ghost, dir: w.now.dir, inCell: w.now.pos[0] === lane };
    });
    // Strays: interpolated against the stray of the same bin in the previous frame.
    const prevStrays = tick.previous?.strays ?? [];
    const strays: DrawnStray[] = (b.strays ?? []).map((st, i) => {
      let p = layout.place(st.pos, st.dir, treeOf(st.s));
      const before = prevStrays.filter((x) => x.k === st.k)[i] ?? prevStrays.find((x) => x.k === st.k);
      if (before && progress < 1 && before.dir === st.dir) {
        p = lerp(layout.place(before.pos, before.dir, treeOf(before.s)), p, progress);
      }
      return { k: st.k, s: st.s, p, inCell: st.pos[0] === lane };
    });
    // Sites holding two walkers (present slot walkers and strays), from the frame data.
    // Dual-rail walkers on different trees (their rails) never share a site.
    const seen = new Map<string, number>();
    const clashes: Point[] = [];
    const occupied = [
      ...b.walkers
        .filter((w) => w.s !== "E" && w.pos && w.pos[0] >= 1)
        .map((w) => ({ pos: w.pos!, tree: treeOf(w.s) })),
      ...(b.strays ?? []).filter((st) => st.pos[0] >= 1).map((st) => ({ pos: st.pos, tree: treeOf(st.s) })),
    ];
    for (const o of occupied) {
      const key = `${o.tree}:${o.pos.join(",")}`;
      seen.set(key, (seen.get(key) ?? 0) + 1);
      if (seen.get(key) === 2) {
        // The same physical site: mark both its drawings in the unfolded view.
        const a = layout.place(o.pos, 1, o.tree);
        const c = layout.place(o.pos, -1, o.tree);
        clashes.push(a);
        if (a.x !== c.x || a.y !== c.y) clashes.push(c);
      }
    }
    return {
      id: b.id,
      amp: b.amp,
      walkers,
      cellsOn: b.cells?.on ?? [],
      strays,
      collided: b.collided ?? false,
      clashes,
    };
  });
}

/** Gate ids firing during the tick that leads to frame `index`, with whether they acted. */
export function firingGates(frame: FrameJSON): Map<string, boolean> {
  const m = new Map<string, boolean>();
  for (const e of frame.events) if (e.kind === "gate") m.set(e.gate, e.fired_in.length > 0);
  return m;
}
