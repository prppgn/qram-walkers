// Level of detail of the tree's text. The tree is drawn in scene units and scaled by the
// zoom k; its text is scaled back so that it is never smaller than MIN_TEXT_PX on screen
// (CSS: font-size = max(base, 13px / k)). Text that would then not fit is shortened or left
// out instead of being drawn smaller: the letters inside nodes and walker discs, the slot
// names above walkers, the cell addresses, the level titles. Pure geometry; no physics.
import type { MetaJSON } from "../model/types";
import { windowGroups } from "./gates";
import { cellBoxes, edgeKey, type Layout } from "./unfoldedH";

export const MIN_TEXT_PX = 13;
/** Average advance of a character of the UI font at 13 px, and of the mono font. */
const CHAR_PX = 7.4;
const MONO_PX = 7.9;

/** Base sizes (scene units) of the text classes that sit inside a fixed shape. */
export const NODE_TEXT = 7;
export const WALKER_GLYPH = 11.5;
export const LENS_GLYPH = 9;

/** Text size on screen, in px, of text of `base` scene units at zoom `k`. */
export function screenPx(base: number, k: number): number {
  return Math.max(base * k, MIN_TEXT_PX);
}

export interface Lod {
  /** Ŝ inside the bifurcation nodes, the walker count on a cell. */
  node: boolean;
  /** R / B inside the walker discs. */
  glyph: boolean;
  /** The memory glyphs inside the cell lens (drawn at the lens's own scale too). */
  lensGlyph: boolean;
  /** Slot names (A₁, D₁ …) above the walkers. */
  walkerLabels: boolean;
  /** Addresses on the memory cells: with the tree arrow (two trees), without, or none. */
  cellLabels: "long" | "short" | "none";
  /** Level titles: "level 1" and "memory cells", "1" and "cells", or none. */
  levels: "long" | "short" | "none";
  /** Port titles: "input port, ↑ tree (logical 0)", "input ↑", or none. */
  ports: "long" | "short" | "none";
  /** Gate labels: all, all but Û_in (which shares the edges with Û_B), or none. */
  gates: "all" | "main" | "none";
}

/** Where a gate label is drawn (TreeCanvas GateWindows), in scene units. */
export interface GateSpot {
  x: number;
  y: number;
  chars: number;
  input: boolean;
}

/** The gate labels of `meta` on `layout`, one per window and side. */
export function gateSpots(layout: Layout, meta: MetaJSON): GateSpot[] {
  const vertical = layout.opts.orientation === "vertical";
  const out: GateSpot[] = [];
  for (const grp of windowGroups(meta)) {
    const first = layout.edges.get(edgeKey(grp.level, 1));
    if (!first) continue;
    const at = first.sites[Math.min(first.sites.length, grp.sites[1]) - 1]!;
    const off = layout.across(grp.type === "U_in" ? (vertical ? -46 : -24) : -13);
    const chars = grp.label.replace("_", "").length * 0.85;
    for (const p of layout.opts.mirror ? [at, layout.mirrorPoint(at)] : [at]) {
      out.push({ x: p.x + off.x, y: p.y + off.y, chars, input: grp.type === "U_in" });
    }
  }
  return out;
}

function gateLabels(layout: Layout, k: number, spots: GateSpot[]): Lod["gates"] {
  const vertical = layout.opts.orientation === "vertical";
  const clash = (list: GateSpot[]) =>
    list.some((a, i) =>
      list.slice(i + 1).some((b) => {
        const wa = a.chars * CHAR_PX;
        const wb = b.chars * CHAR_PX;
        // labels are centred (horizontal) or end at their point (vertical)
        const ca = vertical ? a.x * k - wa / 2 : a.x * k;
        const cb = vertical ? b.x * k - wb / 2 : b.x * k;
        return Math.abs(ca - cb) < (wa + wb) / 2 + 3 && Math.abs(a.y - b.y) * k < MIN_TEXT_PX;
      }),
    );
  if (!clash(spots)) return "all";
  return clash(spots.filter((s) => !s.input)) ? "none" : "main";
}

/** What text fits at zoom `k`, with the cell lens at `lensScale` and the gate labels at
 *  `spots` (gateSpots). */
export function lodFor(layout: Layout, k: number, lensScale = 1, spots: GateSpot[] = []): Lod {
  const vertical = layout.opts.orientation === "vertical";
  const px = (units: number) => units * k;
  // Letters inside shapes are shown only when they reach 13 px at their own size.
  const node = px(NODE_TEXT) >= MIN_TEXT_PX;
  const glyph = px(WALKER_GLYPH) >= MIN_TEXT_PX;
  const lensGlyph = px(LENS_GLYPH * lensScale) >= MIN_TEXT_PX;
  // Slot names: one per walker, walkers one site apart.
  const walkerLabels = px(layout.opts.sitePitch) >= 2.2 * CHAR_PX + 6;
  // Cell addresses: n mono digits (plus " ↑" with two trees) across the box, one line high.
  const box = cellBoxes(layout)[0];
  const rotate = vertical && layout.n >= 3;
  const along = box ? px(rotate ? box.h : box.w) : 0;
  // …and above the memory qubits (at most 8 units high, 5 from the bottom of the box).
  const fitsHigh = box ? rotate || (box.h - 3.5 - 13) * k >= 0.95 * MIN_TEXT_PX : false;
  const fitsChars = (chars: number) => fitsHigh && along >= chars * MONO_PX + 6;
  const cellLabels = fitsChars(layout.n + (layout.trees > 1 ? 2 : 0)) ? "long" : fitsChars(layout.n) ? "short" : "none";
  return { node, glyph, lensGlyph, walkerLabels, cellLabels, levels: levelTitles(layout, k), ports: portTitles(layout, k), gates: gateLabels(layout, k, spots) };
}

/** The port titles fit in the room between the edge of the drawing and the root (the
 *  input title runs over the waiting train, the output title over the leaving one). */
function portTitles(layout: Layout, k: number): Lod["ports"] {
  if (layout.opts.orientation === "vertical") return "long";
  const room = (layout.root.x - 6) * k;
  const dual = layout.trees > 1;
  const long = ("output port".length + (dual ? ", ↑ tree (logical 0)".length : 0)) * CHAR_PX;
  const short = ("output".length + (dual ? 2 : 0)) * CHAR_PX;
  return room >= long ? "long" : room >= short ? "short" : "none";
}

/** The level titles that fit side by side (horizontal) or one per row (vertical). */
function levelTitles(layout: Layout, k: number): Lod["levels"] {
  const { n } = layout;
  const vertical = layout.opts.orientation === "vertical";
  const at = (d: number) => {
    const e = layout.edges.get(edgeKey(d, 1))!;
    const a = e.sites[0]!;
    const b = e.sites[e.sites.length - 1]!;
    return vertical ? (a.y + b.y) / 2 : (a.x + b.x) / 2;
  };
  const centres = Array.from({ length: n }, (_, i) => at(i + 1));
  if (vertical) {
    const gap = Math.min(...centres.slice(1).map((c, i) => c - centres[i]!), Infinity);
    return gap * k >= MIN_TEXT_PX * 1.4 || n === 1 ? "long" : "none";
  }
  const titles = (long: boolean) => {
    const items = centres.map((x, i) => ({ x, w: (long ? `level ${i + 1}′`.length : 2) * CHAR_PX }));
    items.push({ x: layout.xCells, w: (long ? 12 : 5) * CHAR_PX });
    if (layout.opts.mirror) for (const [i, x] of centres.entries()) items.push({ x: 2 * layout.xCells - x, w: (long ? `level ${i + 1}′`.length : 2) * CHAR_PX });
    return items.sort((a, b) => a.x - b.x);
  };
  const fits = (long: boolean) => {
    const items = titles(long);
    return items.every((it, i) => i === 0 || (it.x - items[i - 1]!.x) * k >= (it.w + items[i - 1]!.w) / 2 + 8);
  };
  return fits(true) ? "long" : fits(false) ? "short" : "none";
}

/** The class names that hide what does not fit (see app.css). */
export function lodClasses(lod: Lod): string {
  return [
    lod.node ? "" : "lod-node",
    lod.glyph ? "" : "lod-glyph",
    lod.lensGlyph ? "" : "lod-lglyph",
    lod.walkerLabels ? "" : "lod-wlabel",
    lod.cellLabels === "long" ? "" : lod.cellLabels === "short" ? "lod-cell-short" : "lod-cell",
    lod.levels === "long" ? "" : lod.levels === "short" ? "lod-levels-short" : "lod-levels-none",
    lod.ports === "long" ? "" : lod.ports === "short" ? "lod-ports-short" : "lod-ports-none",
    lod.gates === "all" ? "" : lod.gates === "main" ? "lod-gates-main" : "lod-gates-none",
  ]
    .filter(Boolean)
    .join(" ");
}
