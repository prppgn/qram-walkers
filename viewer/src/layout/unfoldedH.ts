// Tree geometry → pixels for the unfolded "H" layout (DESIGN.md §7.3, an internal design note).
//
// The input tree grows left → right from the port, the memory cells form a column in
// the middle, and the output tree is the mirror image on the right. A walker moving
// backward (direction −1, inverse routing) is drawn at the mirror image of its
// physical position, x ↦ 2·xCells − x, so the train flows left → right throughout and
// leaves through the exit port on the far right (DECISION D2). With `mirror = false`
// the physical single-tree picture is drawn instead. The memory lanes end inside the cells:
// a short stub joins the last node to the face of its cell, and the lane sites lie in the
// box, in its left half (forward) and, mirrored, in its right half (backward), so the
// train slides into the cell, turns unseen and leaves through the opposite face. Their
// inside is drawn by the cell lens. Dual-rail variants have two trees,
// drawn stacked: ↑ (logical 0) on top, ↓ (logical 1) below; the auxiliary rail of the
// cell output circuit is drawn just above the ↓ lanes (DECISION D33). The vertical
// orientation (root on top, like Fig. 1 of the letter) swaps the two axes of the same
// construction: the left child stays on the left.
import type { MetaJSON, Pos } from "../model/types";

export interface Point {
  x: number;
  y: number;
}

export interface LayoutOptions {
  spacing: "proportional" | "uniform";
  mirror: boolean;
  sitePitch: number;
  cellPitch: number;
  orientation: "horizontal" | "vertical";
}

export const DEFAULT_LAYOUT: LayoutOptions = {
  spacing: "proportional",
  mirror: true,
  sitePitch: 22,
  cellPitch: 34,
  orientation: "horizontal",
};

export interface EdgeGeom {
  d: number;
  l: number;
  /** Polyline drawn for the edge (from the parent node to the node / cell). */
  path: Point[];
  /** Centre of site s at index s − 1. */
  sites: Point[];
}

export interface NodeGeom {
  d: number;
  l: number;
  p: Point;
}

export interface CellGeom {
  l: number;
  address: string;
  box: { x: number; y: number; w: number; h: number };
}

export interface Layout {
  opts: LayoutOptions;
  n: number;
  K: number;
  /** Number of trees (2 for dual-rail). */
  trees: number;
  /** Height of one tree. */
  treeHeight: number;
  width: number;
  height: number;
  xRoot: number;
  yRoot: number;
  /** Where the tree starts, on the drawing (the port). */
  root: Point;
  xCells: number;
  cellWidth: number;
  edges: Map<string, EdgeGeom>;
  nodes: NodeGeom[];
  cells: CellGeom[];
  /** Offset of tree t across the tree (0 = ↑ or the only tree, 1 = ↓, 2 = auxiliary rail). */
  treeShift(t: number): number;
  /** SVG transform that draws the static parts of tree t. */
  treeTransform(t: number): string;
  /** Offset of magnitude `d` across the tree (for labels and the spread of branches). */
  across(d: number): Point;
  /** Physical position → point (no mirroring) on tree `tree`. */
  physical(pos: Pos, tree?: number): Point;
  /** Position drawn for a walker moving in direction `dir`, on tree `tree`. */
  place(pos: Pos, dir: number, tree?: number): Point;
  /** Mirror image of a point across the cell column. */
  mirrorPoint(p: Point): Point;
}

export function edgeKey(d: number, l: number): string {
  return `${d},${l}`;
}

const MARGIN = 28;
/** Length of the visible lane, from the last node to the face of the cell, in site pitches. */
const LANE_STUB = 1;
/** Depth of the first lane site in the cell: a walker there is hidden, with its phase ring
 *  (radius 7 + 2.6). */
const LANE_HIDE = 11;
const TREE_GAP = 46;
/** The auxiliary rail is drawn just above the ↓ lane, within the ↓ cell. */
const AUX_LIFT = 5;

export function computeLayout(meta: MetaJSON, opts: LayoutOptions = DEFAULT_LAYOUT): Layout {
  const n = meta.n;
  const K = meta.K;
  const trees = meta.geometry.trees ?? 1;
  const queue = meta.span ?? K;
  const pitch = opts.sitePitch;
  const levelSites = [...meta.geometry.levels.map((l) => l.n_sites), meta.geometry.memory_sites];
  const meanSites = levelSites.slice(0, n).reduce((a, b) => a + b, 0) / n;
  const width = (d: number): number => {
    const sites = levelSites[d - 1]!;
    if (opts.spacing === "uniform" && d <= n) return meanSites * pitch;
    return sites * pitch;
  };
  const nCells = 1 << n;
  const top = MARGIN + 18;
  const xRoot = MARGIN + queue * pitch; // room for the queue waiting at the port
  const nodeX: number[] = [xRoot];
  for (let d = 1; d <= n; d++) nodeX.push(nodeX[d - 1]! + width(d));
  const xCellsLeft = nodeX[n]! + LANE_STUB * pitch;
  const cellWidth = Math.max(54, 12 + 9 * n);
  const xCells = xCellsLeft + cellWidth / 2;
  // Small trees are short and wide: open them up vertically (aspect ≈ 0.4 of the width).
  const span = opts.mirror ? 2 * xCells : xCells;
  const cellPitch = Math.max(opts.cellPitch, Math.min(110, (0.4 * span) / nCells));
  const treeHeight = nCells * cellPitch;
  const yOf = (d: number, l: number): number => top + (l - 0.5) * (1 << (n + 1 - d)) * cellPitch;
  const yRoot = yOf(1, 1);

  // All the geometry below is built horizontally; `T` turns it into the final orientation.
  const vertical = opts.orientation === "vertical";
  const T = (p: Point): Point => (vertical ? { x: p.y, y: p.x } : p);
  const edges = new Map<string, EdgeGeom>();
  const nodes: NodeGeom[] = [];
  for (let d = 1; d <= n + 1; d++) {
    const count = 1 << (d - 1);
    const N = levelSites[d - 1]!;
    for (let l = 1; l <= count; l++) {
      const start: Point =
        d === 1 ? { x: xRoot, y: yRoot } : { x: nodeX[d - 1]!, y: yOf(d - 1, Math.ceil(l / 2)) };
      const endX = d <= n ? nodeX[d]! : xCellsLeft;
      const end: Point = { x: endX, y: yOf(d, l) };
      const sites: Point[] = [];
      let path: Point[];
      if (d <= n) {
        path = [start, end];
        for (let s = 1; s <= N; s++) {
          const f = (s - 0.5) / N;
          sites.push({ x: start.x + f * (end.x - start.x), y: start.y + f * (end.y - start.y) });
        }
        nodes.push({ d, l, p: T(end) });
      } else {
        // memory lane: a stub into the face of the cell, then the sites inside the box,
        // from just behind the face to the middle of the cell (the deepest one)
        path = [start, end];
        const depth = cellWidth / 2 - LANE_HIDE;
        for (let s = 1; s <= N; s++) {
          const f = N > 1 ? (s - 1) / (N - 1) : 0;
          sites.push({ x: xCellsLeft + LANE_HIDE + f * depth, y: end.y });
        }
      }
      edges.set(edgeKey(d, l), { d, l, path: path.map(T), sites: sites.map(T) });
    }
  }

  const cells: CellGeom[] = meta.geometry.cells.map((c) => {
    const x = xCellsLeft;
    const y = yOf(n + 1, c.l) - Math.min(cellPitch * 0.38, 16);
    const w = cellWidth;
    const h = Math.min(cellPitch * 0.76, 32);
    return { l: c.l, address: c.address, box: vertical ? { x: y, y: x, w: h, h: w } : { x, y, w, h } };
  });

  const treeShift = (t: number): number => {
    if (trees < 2 || t === 0) return 0;
    const down = treeHeight + TREE_GAP;
    return t === 2 ? down - AUX_LIFT : down;
  };
  const across = (d: number): Point => (vertical ? { x: d, y: 0 } : { x: 0, y: d });
  const shifted = (p: Point, d: number): Point => {
    const a = across(d);
    return d ? { x: p.x + a.x, y: p.y + a.y } : p;
  };
  const physical = (pos: Pos, tree = 0): Point => {
    const [level, branch, site] = pos;
    const dy = treeShift(tree);
    if (level === 0) return shifted(T({ x: xRoot + (site - 0.5) * pitch, y: yRoot }), dy);
    const e = edges.get(edgeKey(level, branch));
    if (!e) return shifted(T({ x: xRoot, y: yRoot }), dy);
    return shifted(e.sites[Math.min(Math.max(site, 1), e.sites.length) - 1]!, dy);
  };
  const mirrorPoint = (p: Point): Point =>
    vertical ? { x: p.x, y: 2 * xCells - p.y } : { x: 2 * xCells - p.x, y: p.y };
  const place = (pos: Pos, dir: number, tree = 0): Point => {
    const p = physical(pos, tree);
    return opts.mirror && dir < 0 ? mirrorPoint(p) : p;
  };

  const along = opts.mirror ? 2 * xCells : xCells + cellWidth / 2 + MARGIN;
  const acrossSize = top + trees * treeHeight + (trees - 1) * TREE_GAP + MARGIN;
  return {
    opts,
    n,
    K,
    trees,
    treeHeight,
    width: vertical ? acrossSize : along,
    height: vertical ? along : acrossSize,
    xRoot,
    yRoot,
    root: T({ x: xRoot, y: yRoot }),
    xCells,
    cellWidth,
    edges,
    nodes,
    cells,
    treeShift,
    treeTransform: (t) => {
      const a = across(treeShift(t));
      return `translate(${a.x},${a.y})`;
    },
    across,
    physical,
    place,
    mirrorPoint,
  };
}

/** Linear interpolation between two points. */
export function lerp(a: Point, b: Point, f: number): Point {
  return { x: a.x + (b.x - a.x) * f, y: a.y + (b.y - a.y) * f };
}

export interface CellBox {
  l: number;
  /** Tree of the box (0 = ↑ or the only tree, 1 = ↓). */
  tree: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Every cell box of the drawing, on every tree, in drawing coordinates. */
export function cellBoxes(layout: Layout): CellBox[] {
  const out: CellBox[] = [];
  for (let tree = 0; tree < layout.trees; tree++) {
    const a = layout.across(layout.treeShift(tree));
    for (const c of layout.cells) out.push({ l: c.l, tree, x: c.box.x + a.x, y: c.box.y + a.y, w: c.box.w, h: c.box.h });
  }
  return out;
}

/** The longest drawn hop between two neighbouring sites (one tick of a walker), in either
 *  direction: along the port line, along an edge, across a node and into a cell. */
export function longestStep(layout: Layout): number {
  const pairs: [Pos, Pos][] = [];
  for (let s = 0; s > -layout.K; s--) pairs.push([[0, 1, s], [0, 1, s - 1]]);
  pairs.push([[0, 1, 0], [1, 1, 1]]);
  for (const e of layout.edges.values()) {
    const N = e.sites.length;
    for (let s = 1; s < N; s++) pairs.push([[e.d, e.l, s], [e.d, e.l, s + 1]]);
    if (e.d <= layout.n) for (const c of [2 * e.l - 1, 2 * e.l]) pairs.push([[e.d, e.l, N], [e.d + 1, c, 1]]);
  }
  let worst = 0;
  for (const [a, b] of pairs) {
    for (const dir of [1, -1]) {
      const p = layout.place(a, dir);
      const q = layout.place(b, dir);
      worst = Math.max(worst, Math.hypot(p.x - q.x, p.y - q.y));
    }
  }
  return worst;
}

const boxCache = new WeakMap<Layout, CellBox[]>();

/** Whether the point is inside a cell box (a walker there is hidden, and so is its label). */
export function insideCell(layout: Layout, p: Point): boolean {
  let boxes = boxCache.get(layout);
  if (!boxes) {
    boxes = cellBoxes(layout);
    boxCache.set(layout, boxes);
  }
  return boxes.some((b) => p.x >= b.x && p.x <= b.x + b.w && p.y >= b.y && p.y <= b.y + b.h);
}
