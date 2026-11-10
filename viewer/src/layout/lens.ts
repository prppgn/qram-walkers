// The cell lens: the inside of one memory cell, drawn like the figures of the copy in the
// paper. Its lane runs left → right at the tree's scale, from the entrance (where the
// walkers come in from the tree and leave to it) to the deep end; the memory qubits M_j
// sit beside the resting sites of the data walkers D_j, the switch F beside the flag in
// the cell-switch mode; dual-rail cells show the ↑ lane, the auxiliary rail and the ↓ lane
// of the output circuit. The lens shows the physical lane: after the turn the train goes
// back along it and leaves through the entrance, tail first. Data only: positions come
// from the frames, flashes from the gate events.
import { restSite } from "../model/states";
import type { LocalState, MetaJSON, Trajectory } from "../model/types";
import { modulus } from "./kets";
import { walkerTicks, type Place } from "../playback/render";
import { lerp, type Layout, type Point } from "./unfoldedH";

const PAD = 10;
const HEADER = 18;
const TABS = 18;
const LABELS = 14; // room for the walker labels above the first lane
const ROW_GAP = 26;
const RW = 7; // walker radius, as on the tree
const LABEL_COL = 24; // dual-rail: the rail names, past the deep end of the lanes
const CAPTION = 14; // the gate acting in the cell, below the memory
const MEM = 14; // height of a memory qubit

const SUB = "₀₁₂₃₄₅₆₇₈₉";
export const subscript = (i: number): string => String(i).replace(/\d/g, (d) => SUB[Number(d)]!);

export interface LensRow {
  /** Rail drawn on this row: 0 = ↑ (or the only lane), 2 = auxiliary rail, 1 = ↓. */
  tree: 0 | 1 | 2;
  y: number;
  label: string;
}

export interface LensMemory {
  /** Data slot whose resting site it is beside. */
  k: number;
  /** Bit index j of M_j. */
  bit: number;
  x: number;
  /** Top of the qubit's box. */
  y: number;
  label: string;
}

export interface LensGeom {
  w: number;
  h: number;
  pitch: number;
  header: number;
  tabs: number;
  rows: LensRow[];
  /** The lane line: from the frame's left edge (towards the tree) to its deep end. */
  laneEnd: number;
  /** Baseline of the caption naming the gate that acts in the cell. */
  caption: number;
  /** Where walkers enter from the tree and leave to it (just outside the frame). */
  entryX: number;
  siteX(s: number): number;
  rowY(tree: number): number;
  memory: LensMemory[];
  /** The switch F of the cell-switch mode, beside the resting site of the flag. */
  lamp: { x: number; y: number; k: number } | null;
}

export function lensGeometry(meta: MetaJSON, pitch: number, tabs: boolean): LensGeom {
  const dual = (meta.geometry.trees ?? 1) > 1;
  const N = meta.geometry.memory_sites;
  const left = PAD;
  const siteX = (s: number) => left + pitch + (s - 0.5) * pitch;
  const top = PAD + HEADER + (tabs ? TABS : 0) + LABELS + RW;
  const rows: LensRow[] = dual
    ? [
        { tree: 0, y: top, label: "↑" },
        { tree: 2, y: top + ROW_GAP, label: "aux" },
        { tree: 1, y: top + 2 * ROW_GAP, label: "↓" },
      ]
    : [{ tree: 0, y: top, label: "" }];
  const dataRow = rows.at(-1)!; // the memory acts on the ↓ lane of dual-rail cells
  const memY = dataRow.y + RW + 8;
  const memory = meta.slots
    .filter((s) => s.role === "data")
    .map((s) => ({ k: s.k, bit: s.bit, x: siteX(restSite(meta, s.k)), y: memY, label: `M${subscript(s.bit)}` }));
  const flag = meta.slots.find((s) => s.role === "flag");
  const lamp = meta.copy_mode === "cell_switch" && flag ? { x: siteX(restSite(meta, flag.k)), y: memY + MEM / 2, k: flag.k } : null;
  const laneEnd = siteX(N) + pitch / 2;
  const rowY = (tree: number) => rows.find((r) => r.tree === tree)?.y ?? dataRow.y;
  return {
    w: Math.max(laneEnd + PAD + 6 + (dual ? LABEL_COL : 0), tabs ? 220 : 160),
    h: memY + MEM + 14 + CAPTION + PAD,
    pitch,
    header: HEADER,
    tabs: tabs ? TABS : 0,
    rows,
    laneEnd,
    caption: memY + MEM + 14 + CAPTION - 2,
    entryX: -RW - 2,
    siteX,
    rowY,
    memory,
    lamp,
  };
}

export interface LensWalker {
  branch: number;
  k: number;
  s: LocalState;
  ghost: boolean;
  p: Point;
}

export interface LensLink {
  /** What the gate couples to the lane: a memory qubit ("M1", …), the switch "F", or the
   *  walker that controls it ("control"). */
  from: string;
  a: Point;
  b: Point;
}

export interface LensFlash {
  gate: string;
  label: string;
  /** Span of the gate's window along the lane. */
  x0: number;
  x1: number;
  links: LensLink[];
}

export interface LensScene {
  walkers: LensWalker[];
  flashes: LensFlash[];
  /** Weight with which the switch F of this cell is on. */
  on: number;
  /** The tick that flips the train (the turn): nothing moves in the lens. */
  turning: boolean;
}

/** What the lens of cell `l` shows at frame `index`, `progress` of the way from the
 *  previous frame. Walkers carry no branch spread: the drawing adds it. */
export function lensScene(traj: Trajectory, index: number, progress: number, l: number, showGhosts: boolean, g: LensGeom): LensScene {
  const meta = traj.meta;
  const lane = meta.n + 1;
  const cur = traj.frames[index]!;
  const here = (p: Place | null): p is Place => !!p && p.pos[0] === lane && p.pos[1] === l;
  const at = (p: Place): Point => ({ x: g.siteX(p.pos[2]), y: g.rowY(p.tree) });
  const walkers: LensWalker[] = [];
  for (const tick of walkerTicks(traj, index, progress, showGhosts)) {
    for (const w of tick.walkers) {
      const inNow = here(w.now);
      const inBefore = here(w.before);
      if (!inNow && !inBefore) continue;
      let p: Point;
      if (w.before) {
        // entering: from the entrance; leaving: back to it (the physical lane, no mirror)
        const a = inBefore ? at(w.before) : { x: g.entryX, y: g.rowY(w.now.tree) };
        const b = inNow ? at(w.now) : { x: g.entryX, y: g.rowY(w.before.tree) };
        p = lerp(a, b, w.f);
      } else if (inNow) {
        p = at(w.now);
      } else continue;
      walkers.push({ branch: tick.id, k: w.k, s: w.s, ghost: w.ghost, p });
    }
  }

  const byId = new Map(meta.gates.map((x) => [x.id, x]));
  const flashes: LensFlash[] = [];
  for (const e of cur.events) {
    if (e.kind !== "gate" || e.level !== lane || e.fired_in.length === 0) continue;
    if (!e.edges.some(([, x]) => x === l)) continue;
    const gate = byId.get(e.gate);
    if (!gate) continue;
    const sites = gate.window.length ? gate.window : gate.target_sites;
    const lo = Math.min(...sites);
    const hi = Math.max(...sites);
    const dataY = g.rows.at(-1)!.y;
    const links: LensLink[] = [];
    for (const j of gate.target_bits) {
      const m = g.memory.find((q) => q.bit === j);
      if (!m) continue;
      for (const s of gate.target_sites) links.push({ from: `M${j}`, a: { x: m.x, y: m.y }, b: { x: g.siteX(s), y: dataY } });
    }
    if ((gate.type === "cell_on" || gate.type === "cell_off") && g.lamp && gate.control_site !== null) {
      links.push({ from: "F", a: { x: g.lamp.x, y: g.lamp.y }, b: { x: g.siteX(gate.control_site), y: dataY } });
    } else if (gate.control_site !== null) {
      for (const s of gate.target_sites) {
        if (s !== gate.control_site) links.push({ from: "control", a: { x: g.siteX(gate.control_site), y: dataY }, b: { x: g.siteX(s), y: dataY } });
      }
    }
    flashes.push({ gate: gate.id, label: gate.label, x0: g.siteX(lo) - g.pitch / 2, x1: g.siteX(hi) + g.pitch / 2, links });
  }

  const total = cur.branches.reduce((a, b) => a + modulus(b.amp) ** 2, 0) || 1;
  const on = cur.branches.filter((b) => b.cells?.on.includes(l)).reduce((a, b) => a + modulus(b.amp) ** 2 / total, 0);
  const turning = progress < 1 && cur.events.some((e) => e.kind === "turn");
  return { walkers, flashes, on, turning };
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Where the lens is drawn, in drawing coordinates: by default below the drawing on the
 *  right (or on its right, at the bottom, when the drawing is taller than wide), moved and
 *  scaled by `at`. Scaling keeps the top-left corner, so the resize handle at the
 *  bottom-right follows the pointer. */
export function lensRect(layout: Layout, g: LensGeom, at: { dx: number; dy: number; scale: number }): Rect & { scale: number } {
  const wide = layout.width >= layout.height;
  const x = (wide ? layout.width - g.w - 28 : layout.width + 6) + at.dx;
  const y = (wide ? layout.height + 6 : layout.height - g.h - 28) + at.dy;
  return { x, y, w: g.w * at.scale, h: g.h * at.scale, scale: at.scale };
}

/** The drawing and the lens together (what Fit, the exports and the video frame). */
export function sceneBounds(layout: Layout, lens: Rect | null): Rect {
  if (!lens) return { x: 0, y: 0, w: layout.width, h: layout.height };
  const m = 6;
  const x0 = Math.min(0, lens.x - m);
  const y0 = Math.min(0, lens.y - m);
  const x1 = Math.max(layout.width, lens.x + lens.w + m);
  const y1 = Math.max(layout.height, lens.y + lens.h + m);
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
