// The tree: edges and sites, Ŝ nodes, Û⁽ᵈ⁾ windows with flashes, memory cells with
// their qubits and switches, and the walkers of every branch (DESIGN.md §7.3–7.4). The
// memory lanes end inside the cells: walkers slide behind the face of a cell and are
// hidden there (a clip path cuts the cell boxes out of the walker layer).
// Dual-rail variants draw the static parts once per tree (↑ on top, ↓ below); walkers
// are placed on the tree of their rail. Zoom with the wheel, pan by dragging, "Fit".
// `TreeScene` is the drawing alone, used by the interactive canvas, the render stage of
// the video and figure exports, and the comparison pane; figure mode (DESIGN.md §7.6)
// adds (d,l) labels and kets near the train and drops the flashes.
import { Fragment, memo, useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import type { EventJSON, MetaJSON, Trajectory } from "../model/types";
import { cellBoxes, computeLayout, DEFAULT_LAYOUT, edgeKey, insideCell, type CellBox, type Layout, type Point } from "../layout/unfoldedH";
import { ketTokens, phaseDeg, modulus } from "../layout/kets";
import { TREE_GATES, windowGroups } from "../layout/gates";
import { cellLights, type CellLight } from "../playback/cells";
import { drawFrame, type DrawnBranch } from "../playback/render";
import { colourOf, describeState, discClass, memoryGlyph, treeOf } from "../model/states";
import { usePlayback, type ViewOptions } from "../playback/store";
import { lensGeometry, lensRect, sceneBounds, type Rect } from "../layout/lens";
import { hasLens, lensCells, manyCells } from "../playback/cells";
import { CellLens, GateLabel, lensChoice, type LensUi } from "./CellLens";
import { ExportMenu } from "./ExportMenu";
import { InfoButton } from "./Panel";

const R = 7;
const RB = 5; // backup walkers are drawn smaller, with a white centre dot

function pathD(points: Point[], mirror: ((p: Point) => Point) | null): string {
  return points
    .map((p, i) => {
      const q = mirror ? mirror(p) : p;
      return `${i ? "L" : "M"}${q.x.toFixed(1)},${q.y.toFixed(1)}`;
    })
    .join(" ");
}

const TREE_NAMES = ["↑ tree (logical 0)", "↓ tree (logical 1)"];

const StaticTree = memo(function StaticTree({
  layout,
  meta,
  tree,
  figure,
}: {
  layout: Layout;
  meta: MetaJSON;
  tree: number;
  figure: boolean;
}) {
  const sides: ((p: Point) => Point)[] = [(p) => p];
  if (layout.opts.mirror) sides.push(layout.mirrorPoint);
  const { n } = layout;
  const vertical = layout.opts.orientation === "vertical";
  const levelLabels = tree === 0;
  // Level titles run along the tree: above it when horizontal, on its left when vertical.
  const levelAt = (d: number): Point => {
    const e = layout.edges.get(edgeKey(d, 1))!;
    const a = e.sites[0]!;
    const b = e.sites[e.sites.length - 1]!;
    return vertical ? { x: 4, y: (a.y + b.y) / 2 } : { x: (a.x + b.x) / 2, y: 16 };
  };
  const anchor = vertical ? "start" : "middle";
  const treeName = layout.trees > 1 ? `, ${TREE_NAMES[tree]}` : "";
  // Long dual-rail labels start at the edge of the drawing, so that they are not clipped.
  const wide = layout.trees > 1 && !vertical;
  const inPos = vertical
    ? { x: layout.root.x + 12, y: layout.root.y - 6 }
    : { x: wide ? 4 : layout.root.x - 6, y: layout.root.y - 28 };
  const outRoot = layout.mirrorPoint(layout.root);
  const outPos = vertical
    ? { x: outRoot.x + 12, y: outRoot.y + 14 }
    : { x: wide ? layout.width - 4 : outRoot.x + 6, y: outRoot.y - 28 };
  return (
    <g className="static-tree">
      {sides.map((m, si) => (
        <g key={si}>
          {[...layout.edges.values()].map((e) => (
            <path key={edgeKey(e.d, e.l)} d={pathD(e.path, si ? m : null)} className={e.d > n ? "lane" : "edge"} />
          ))}
          {[...layout.edges.values()]
            .filter((e) => e.d <= n) // the lane sites are inside the cells (see the cell lens)
            .flatMap((e) =>
              e.sites.map((p, i) => {
                const q = m(p);
                return <circle key={`${e.d},${e.l},${i}`} cx={q.x} cy={q.y} r={1.6} className="site" />;
              }),
            )}
          {layout.nodes.map((nd) => {
            const q = m(nd.p);
            return (
              <g key={`${nd.d},${nd.l}`} transform={`translate(${q.x},${q.y})`} className="node">
                <title>{`${si ? "Ŝ†" : "Ŝ"} at bifurcation (${nd.d},${nd.l})`}</title>
                <circle r={6.5} />
                <text y={2.8} textAnchor="middle">
                  {si ? "Ŝ†" : "Ŝ"}
                </text>
              </g>
            );
          })}
          {figure &&
            [...layout.edges.values()]
              .filter((e) => e.d <= n && e.d <= 4)
              .map((e) => {
                const mid = m(e.sites[Math.floor(e.sites.length / 2)]!);
                // on the far side of the edge: walker and gate labels sit on the near one
                const a = layout.across(vertical ? 9 : 15);
                return (
                  <text key={edgeKey(e.d, e.l)} x={mid.x + a.x} y={mid.y + a.y} className="edge-label" textAnchor={vertical ? "start" : "middle"}>
                    {`(${e.d}${si ? "′" : ""},${e.l})`}
                  </text>
                );
              })}
          {levelLabels &&
            Array.from({ length: n }, (_, i) => i + 1).map((d) => {
              const q = m(levelAt(d));
              return (
                <text key={d} x={q.x} y={q.y} className="level-label" textAnchor={anchor}>
                  {`level ${d}${si ? "′" : ""}`}
                </text>
              );
            })}
          {levelLabels && si === 0 && (
            <text x={vertical ? 4 : layout.xCells} y={vertical ? layout.xCells : 16} className="level-label" textAnchor={anchor}>
              {vertical ? "cells" : "memory cells"}
            </text>
          )}
        </g>
      ))}
      <text x={inPos.x} y={inPos.y} className="port-label" textAnchor={vertical || wide ? "start" : "end"}>
        {figure ? `|ψ_in⟩${treeName}` : `input port${treeName}`}
      </text>
      {layout.opts.mirror && (
        <text x={outPos.x} y={outPos.y} className="port-label" textAnchor={wide ? "end" : "start"}>
          {figure ? `|ψ_out⟩${treeName}` : `output port${treeName}`}
        </text>
      )}
      <title>{`${meta.variant} variant, n = ${meta.n}, m = ${meta.m}`}</title>
    </g>
  );
});

function GateLayer({
  layout,
  meta,
  events,
  phase,
  pulse,
  tree,
  figure,
}: {
  layout: Layout;
  meta: MetaJSON;
  events: EventJSON[];
  phase: string;
  pulse: number;
  tree: number;
  figure: boolean;
}) {
  const groups = useMemo(() => windowGroups(meta), [meta]);
  const byId = useMemo(() => new Map(meta.gates.map((g) => [g.id, g])), [meta]);
  const mirrorSide = layout.opts.mirror && phase === "inverse";
  const sides = layout.opts.mirror ? [false, true] : [false];
  const segment = (level: number, l: number, lo: number, hi: number, mirrored: boolean) => {
    const e = layout.edges.get(edgeKey(level, l))!;
    return pathD([e.sites[lo - 1]!, e.sites[hi - 1]!], mirrored ? layout.mirrorPoint : null);
  };
  // Every gate instance firing in this tick flashes its own window, on the edges where
  // it acted (or, grey, on every edge of its level when its control was absent).
  const flashes: { d: string; acted: boolean; key: string }[] = [];
  for (const e of figure ? [] : events) {
    if (e.kind !== "gate" || !TREE_GATES.has(e.type)) continue;
    const g = byId.get(e.gate);
    if (!g) continue;
    // dual-rail: a gate acts on the tree of its control, i.e. of the walkers it changed
    const acting = new Set(e.changes.filter((c) => !c.ghost).map((c) => treeOf(c.to)));
    if (layout.trees > 1 && acting.size > 0 && !acting.has(tree as 0 | 1)) continue;
    const lo = Math.min(...g.window);
    const hi = Math.max(...g.window);
    const acted = e.fired_in.length > 0;
    const edges = acted ? e.edges.map((x) => x[1]) : Array.from({ length: 1 << (g.level - 1) }, (_, i) => i + 1);
    for (const l of edges) flashes.push({ d: segment(g.level, l, lo, hi, mirrorSide), acted, key: `${e.gate}:${l}` });
  }
  return (
    <g className="gates">
      {groups.map((grp) =>
        sides.map((mirrored) => {
          const count = 1 << (grp.level - 1);
          const first = layout.edges.get(edgeKey(grp.level, 1))!;
          const labelAt = first.sites[Math.min(first.sites.length, grp.sites[1]) - 1]!;
          const lp = mirrored ? layout.mirrorPoint(labelAt) : labelAt;
          // Û_in and Û_B share a window in the short-range qudit: keep their labels apart.
          const vertical = layout.opts.orientation === "vertical";
          const off = layout.across(grp.type === "U_in" ? (vertical ? -46 : -24) : -13);
          return (
            <g key={`${grp.key}:${mirrored}`}>
              {Array.from({ length: count }, (_, i) => i + 1).map((l) => {
                const e = layout.edges.get(edgeKey(grp.level, l))!;
                const ctrl = grp.control ? e.sites[grp.control - 1] : undefined;
                const c = ctrl && (mirrored ? layout.mirrorPoint(ctrl) : ctrl);
                return (
                  <g key={l}>
                    <path
                      d={segment(grp.level, l, grp.sites[0], grp.sites[1], mirrored)}
                      className={grp.type === "U_in" ? "gate-band gate-in" : "gate-band"}
                    >
                      <title>{`${grp.tip} — edge (${grp.level},${l})`}</title>
                    </path>
                    {c && grp.type !== "U_in" && <circle cx={c.x} cy={c.y} r={R + 3} className="gate-control" />}
                  </g>
                );
              })}
              <text x={lp.x + off.x} y={lp.y + off.y} className="gate-label" textAnchor={layout.opts.orientation === "vertical" ? "end" : "middle"}>
                <GateLabel label={grp.label} />
              </text>
            </g>
          );
        }),
      )}
      {flashes.map((f) => (
        <path key={f.key} d={f.d} className={f.acted ? "gate-flash act" : "gate-flash idle"} style={{ opacity: 0.25 + 0.75 * pulse }} />
      ))}
    </g>
  );
}

/** Faint paths already travelled by the address walkers (toggle "traces"). */
function TraceLayer({
  traj,
  layout,
  frame,
  highlight,
}: {
  traj: Trajectory;
  layout: Layout;
  frame: number;
  highlight: number | null;
}) {
  const paths = useMemo(() => {
    const out = new Map<string, Point[]>();
    const address = traj.meta.slots.filter((s) => s.role === "address").map((s) => s.k);
    traj.frames.forEach((f) => {
      for (const b of f.branches) {
        for (const k of address) {
          const w = b.walkers[k];
          if (!w || w.s === "E" || !w.pos) continue;
          const key = `${b.id}:${k}`;
          const pts = out.get(key) ?? [];
          pts.push(layout.place(w.pos, w.dir ?? 1, treeOf(w.s)));
          out.set(key, pts);
        }
      }
    });
    return out;
  }, [traj, layout]);
  const lines: { key: string; d: string }[] = [];
  for (const [key, pts] of paths) {
    const bid = Number(key.split(":")[0]);
    if (highlight !== null && bid !== highlight) continue;
    const seen = pts.slice(0, frame + 1);
    if (seen.length > 1) lines.push({ key, d: pathD(seen, null) });
  }
  return (
    <g className="traces">
      {lines.map((l) => (
        <path key={l.key} d={l.d} />
      ))}
    </g>
  );
}

function CellLayer({
  layout,
  traj,
  branches,
  events,
  pulse,
  tree,
  figure,
  lights,
  lensCell,
  onCell,
}: {
  layout: Layout;
  traj: Trajectory;
  branches: DrawnBranch[];
  events: EventJSON[];
  pulse: number;
  tree: number;
  figure: boolean;
  lights: CellLight[];
  /** Cell shown by the lens: outlined, on the box the guide line starts from. */
  lensCell: number | null;
  onCell?: (l: number) => void;
}) {
  const meta = traj.meta;
  const vertical = layout.opts.orientation === "vertical";
  // dual-rail: the memory qubits act on the ↓ lane (the data arrive there)
  const showBits = layout.trees < 2 || tree === 1;
  const dataSlots = meta.slots.filter((s) => s.role === "data");
  const lane = meta.n + 1;
  const total = branches.reduce((a, b) => a + modulus(b.amp) ** 2, 0) || 1;
  const onWeight = new Map<number, number>();
  for (const b of branches) for (const l of b.cellsOn) onWeight.set(l, (onWeight.get(l) ?? 0) + modulus(b.amp) ** 2 / total);
  const copyFired = new Map<number, boolean>();
  for (const e of figure ? [] : events) {
    if (e.kind === "gate" && e.level === lane) for (const [, l] of e.edges) copyFired.set(l, true);
  }
  const switchMode = meta.copy_mode === "cell_switch";
  const anchorTree = layout.trees > 1 ? 1 : 0;
  const m = dataSlots.length;
  return (
    <g className="cells">
      {layout.cells.map((c) => {
        const b = c.box;
        const bits = meta.memory[c.l - 1] ?? [];
        const w = onWeight.get(c.l) ?? 0;
        const light = lights.find((x) => x.l === c.l && x.tree === tree);
        const lit = light?.lit ?? 0;
        const grey = light?.grey ?? 0;
        // the memory qubits M_j in a row along the long side of the box, the address above
        const long = vertical ? b.h : b.w;
        const size = Math.max(3, Math.min(8, (0.5 * long - 3 * (m - 1)) / Math.max(1, m)));
        const run = m * size + (m - 1) * 3;
        const bitAt = (i: number): Point =>
          vertical
            ? { x: b.x + (b.w - size) / 2, y: b.y + b.h - 5 - run + i * (size + 3) }
            : { x: b.x + (b.w - run) / 2 + i * (size + 3), y: b.y + b.h - size - 5 };
        const rotate = vertical && meta.n >= 3;
        const labelAt = rotate ? { x: b.x + b.w / 2, y: b.y + b.h * 0.32 } : { x: b.x + b.w / 2, y: b.y + 12 };
        const state = lit > 0 ? `; the train is inside (weight ${lit.toFixed(3)})` : grey > 0 ? "; only dispersed address walkers inside" : "";
        return (
          <g
            key={c.l}
            data-cell={c.l}
            className={onCell && lit > 0 ? "cell-group clickable" : "cell-group"}
            onClick={onCell && lit > 0 ? () => onCell(c.l) : undefined}
          >
            <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} className="cell">
              <title>{`Memory cell ${c.l} = |${c.address}⟩ storing b = ${bits.join("")}${state}${onCell && lit > 0 ? ". Click to look inside" : ""}`}</title>
            </rect>
            {grey > 0 && lit === 0 && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} className="cell-dim" style={{ fillOpacity: 0.12 + 0.3 * grey }} />}
            {lit > 0 && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} className="cell-lit" data-cell={c.l} style={{ fillOpacity: 0.2 + 0.8 * lit }} />}
            {copyFired.get(c.l) && <rect x={b.x} y={b.y} width={b.w} height={b.h} rx={4} className="cell-active" style={{ opacity: 0.4 + 0.6 * pulse }} />}
            {lensCell === c.l && tree === anchorTree && <rect x={b.x - 3} y={b.y - 3} width={b.w + 6} height={b.h + 6} rx={6} className="lens-target" />}
            <text x={labelAt.x} y={labelAt.y} textAnchor="middle" className="cell-label" transform={rotate ? `rotate(-90 ${labelAt.x} ${labelAt.y})` : undefined}>
              {c.address}
              {layout.trees > 1 ? (tree === 0 ? " ↑" : " ↓") : ""}
            </text>
            {showBits &&
              dataSlots.map((s, i) => {
                const bit = bits[s.bit - 1] ?? 0;
                const glyph = memoryGlyph(meta.family, bit);
                const q = bitAt(i);
                return (
                  <rect key={s.k} x={q.x} y={q.y} width={size} height={size} className={bit ? "mem-bit one" : "mem-bit zero"}>
                    <title>{`M${s.bit} of cell |${c.address}⟩ = ${glyph} (bit ${bit}), beside the resting site of ${s.label} (see the cell lens)`}</title>
                  </rect>
                );
              })}
            {switchMode && showBits && (
              <circle cx={b.x + b.w - 7} cy={b.y + 7} r={4} className="switch" style={{ fillOpacity: 0.15 + 0.85 * w }}>
                <title>{`Cell switch F of |${c.address}⟩: on with probability ${w.toFixed(3)}`}</title>
              </circle>
            )}
            {lit > 0 && (light?.count ?? 0) > 0 && (
              <g className="cell-count" transform={`translate(${b.x},${b.y})`}>
                <circle r={6.5} />
                <text y={2.8} textAnchor="middle">
                  {light!.count}
                </text>
                <title>{`${light!.count} walker${light!.count > 1 ? "s" : ""} inside cell |${c.address}⟩${layout.trees > 1 ? (tree === 0 ? " on the ↑ lane" : " on the ↓ lane and the auxiliary rail") : ""}`}</title>
              </g>
            )}
          </g>
        );
      })}
    </g>
  );
}

/** Two walkers on one site: drawn above the cells, so that a collision inside a cell shows. */
function ClashLayer({ layout, branches, highlight }: { layout: Layout; branches: DrawnBranch[]; highlight: number | null }) {
  const B = branches.length;
  const spread = Math.min(5, 12 / Math.max(B, 1));
  return (
    <g className="clashes">
      {branches.flatMap((b, bi) => {
        const off = layout.across(B > 1 ? (bi - (B - 1) / 2) * spread : 0);
        const opacity = highlight !== null && highlight !== b.id ? 0.08 : 1;
        return b.clashes.map((c, i) => (
          <g key={`${b.id}:${i}`} transform={`translate(${c.x + off.x},${c.y + off.y})`} className="clash" data-testid="clash" style={{ opacity }}>
            <path d="M-10,-10 L10,10 M10,-10 L-10,10" />
            <title>Collision: two walkers on one site; the branch is frozen and counts as a failure</title>
          </g>
        ));
      })}
    </g>
  );
}

/** Everything but the cell boxes, for clipping the walkers that are inside a cell. */
function outsideCells(boxes: CellBox[]): string {
  const far = 1e5;
  return [`M${-far},${-far} H${far} V${far} H${-far} Z`, ...boxes.map((b) => `M${b.x},${b.y} h${b.w} v${b.h} h${-b.w} Z`)].join(" ");
}

function WalkerLayer({
  layout,
  branches,
  labels,
  traj,
  opacityMode,
  highlight,
  figure,
}: {
  layout: Layout;
  branches: DrawnBranch[];
  labels: boolean;
  traj: Trajectory;
  opacityMode: "prob" | "amp";
  highlight: number | null;
  figure: boolean;
}) {
  const B = branches.length;
  // Figure mode shows the phase rings only when they say something (relative phases).
  const rings = B > 1 && !(figure && new Set(branches.map((b) => Math.round(phaseDeg(b.amp)))).size === 1);
  const spread = Math.min(5, 12 / Math.max(B, 1));
  return (
    <g className="walkers">
      {branches.map((b, bi) => {
        const a = modulus(b.amp);
        const weight = opacityMode === "prob" ? a * a : a;
        let opacity = Math.max(0.18, Math.min(1, weight * (opacityMode === "prob" ? B : Math.sqrt(B))));
        if (B === 1) opacity = 1;
        if (highlight !== null) opacity = highlight === b.id ? 1 : 0.08;
        const off = layout.across(B > 1 ? (bi - (B - 1) / 2) * spread : 0);
        const hue = phaseDeg(b.amp);
        return (
          <g key={b.id} style={{ opacity }} data-branch={b.id} className={b.collided ? "collided" : undefined}>
            {b.strays.map((st, i) => (
              <g key={`stray-${i}`} transform={`translate(${st.p.x + off.x},${st.p.y + off.y})`} className={`walker stray ${discClass(st.s)}`} data-testid="stray">
                <circle r={R + 3} className="stray-ring" />
                <circle r={R} className="disc" />
                <text y={3.2} textAnchor="middle" className="walker-glyph">
                  {st.s}
                </text>
                {labels && !insideCell(layout, st.p) && (
                  <text y={-R - 6} textAnchor="middle" className="walker-label stray-label">
                    {st.k >= 0 ? `stray (${traj.meta.slots[st.k]!.label})` : "stray"}
                  </text>
                )}
                <title>{`Stray walker |${st.s}⟩ created by a copy on an empty site${st.k >= 0 ? `, time bin of ${traj.meta.slots[st.k]!.label}` : ""}`}</title>
              </g>
            ))}
            {b.walkers.map((w) => {
              const slot = traj.meta.slots[w.k]!;
              const x = w.p.x + off.x;
              const y = w.p.y + off.y;
              if (w.ghost) {
                return (
                  <g key={w.k} transform={`translate(${x},${y})`} className="ghost" data-key={`${b.id}:${w.k}`}>
                    <circle r={slot.backup ? RB : R} />
                    {labels && !insideCell(layout, w.p) && (
                      <text y={-R - 3} textAnchor="middle" className="walker-label">
                        {slot.label}
                      </text>
                    )}
                    <title>{`${slot.label}: empty slot |∅⟩ (ghost, rendering only)`}</title>
                  </g>
                );
              }
              return (
                <g key={w.k} transform={`translate(${x},${y})`} className={`walker ${discClass(w.s)}`} data-testid="walker" data-state={w.s} data-key={`${b.id}:${w.k}`}>
                  {rings && <circle r={(slot.backup ? RB : R) + 2.6} className="phase-ring" style={{ stroke: `hsl(${hue}, 75%, 50%)` }} />}
                  <circle r={slot.backup ? RB : R} className="disc" />
                  {slot.backup ? (
                    <circle r={1.6} className="backup-dot" />
                  ) : (
                    <text y={3.2} textAnchor="middle" className="walker-glyph">
                      {colourOf(w.s)}
                    </text>
                  )}
                  {labels && !insideCell(layout, w.p) && (
                    <text y={-R - 4} textAnchor="middle" className="walker-label">
                      {slot.label}
                    </text>
                  )}
                  <title>{`${slot.label}: ${describeState(w.s)}, branch ${b.id}, amplitude ${a.toFixed(4)} ∠ ${hue.toFixed(0)}°`}</title>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

/** Kets near the train (figure mode), one per branch, in the paper's notation. */
const MAX_ANNOTATED = 4;

/** The cell box whose centre is nearest to `p` (the one a walker inside a cell is in). */
function nearestBox(layout: Layout, p: Point): CellBox {
  let best = cellBoxes(layout)[0]!;
  let d = Infinity;
  for (const b of cellBoxes(layout)) {
    const e = Math.hypot(b.x + b.w / 2 - p.x, b.y + b.h / 2 - p.y);
    if (e < d) [best, d] = [b, e];
  }
  return best;
}

function KetAnnotations({
  layout,
  traj,
  frame,
  branches,
  view,
}: {
  layout: Layout;
  traj: Trajectory;
  frame: number;
  branches: DrawnBranch[];
  view: ViewOptions;
}) {
  const stored = traj.frames[frame]!.branches;
  const slots = traj.meta.slots;
  const beside = new Map<string, number>(); // kets already on each side of each cell
  return (
    <g className="ket-annotations">
      {branches.slice(0, MAX_ANNOTATED).map((b, i) => {
        const rec = stored.find((x) => x.id === b.id);
        if (!rec) return null;
        const present = b.walkers.filter((w) => !w.ghost);
        const lead = present.find((w) => slots[w.k]!.register === "D") ?? present[0] ?? b.walkers[0];
        if (!lead) return null;
        const tokens = ketTokens(rec, slots, view.ketOrder);
        // above the walker; when the train is inside a cell (root on the left), outside the
        // cell, on the side facing away from the middle of the column: above the upper cells,
        // below the lower ones
        let at = lead.p;
        let off = layout.across(-(R + 34 + 13 * i));
        if (lead.inCell && layout.opts.orientation !== "vertical") {
          const box = nearestBox(layout, lead.p);
          const column = cellBoxes(layout).filter((b) => b.tree === box.tree);
          const mid = (Math.min(...column.map((b) => b.y)) + Math.max(...column.map((b) => b.y + b.h))) / 2;
          const upper = box.y + box.h / 2 < mid - 1e-6;
          const side = `${box.tree}:${box.l}:${upper}`;
          const j = beside.get(side) ?? 0;
          beside.set(side, j + 1);
          at = { x: lead.p.x, y: upper ? box.y : box.y + box.h };
          off = { x: 0, y: upper ? -(12 + 13 * j) : 22 + 13 * j };
        }
        // Estimated width, to keep the sentence inside the drawing.
        const half = (tokens.length * (view.ketPositions ? 32 : 18)) / 2;
        const x = Math.max(half + 2, Math.min(layout.width - half - 2, at.x + off.x));
        return (
          <text key={b.id} x={x} y={Math.min(layout.height - 4, Math.max(12, at.y + off.y))} textAnchor="middle" className="ket-annotation">
            {tokens.map((t) => (
              <Fragment key={t.k}>
                |<tspan className={`g-${colourOf(t.s) ?? "E"}`}>{t.glyph}</tspan>
                {view.ketPositions && t.sup ? (
                  <>
                    <tspan dy={-4} fontSize="0.72em">
                      {t.sup}
                    </tspan>
                    <tspan dy={4}>⟩</tspan>
                  </>
                ) : (
                  "⟩"
                )}
                <tspan dy={3} fontSize="0.72em">
                  {t.sub}
                </tspan>
                <tspan dy={-3}> </tspan>
              </Fragment>
            ))}
          </text>
        );
      })}
    </g>
  );
}

export interface SceneProps {
  traj: Trajectory;
  layout: Layout;
  frame: number;
  progress: number;
  view: ViewOptions;
  highlight: number | null;
  /** The cell lens (when `view.lens`): the cell chosen, whether it was closed, and what the
   *  canvas lets it do. Absent: no lens (the comparison pane). */
  lens?: { chosen: number | null; closed?: boolean; ui?: LensUi };
}

/** Layout of a trajectory under the current view options. */
export function layoutFor(traj: Trajectory, view: Pick<ViewOptions, "mirror" | "spacing" | "orientation">): Layout {
  return computeLayout(traj.meta, {
    ...DEFAULT_LAYOUT,
    mirror: view.mirror,
    spacing: view.spacing,
    orientation: view.orientation,
  });
}

/** The drawing of one instant of a trajectory: place it inside `.canvas svg`. */
export function TreeScene({ traj, layout, frame, progress, view, highlight, lens }: SceneProps) {
  const cur = traj.frames[frame]!;
  const branches = drawFrame(traj, layout, frame, progress, view.ghosts);
  const events = cur.events;
  const figure = view.figure;
  const clip = `cells-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const outside = useMemo(() => outsideCells(cellBoxes(layout)), [layout]);
  const lights = cellLights(traj, frame, progress);
  // Flash intensity: routing gates fire at the start of the tick, inverse gates at the end.
  const pulse = progress >= 1 ? 1 : cur.phase === "inverse" ? Math.max(0, (progress - 0.6) / 0.4) : 1 - progress;
  const choice = lens && view.lens ? lensChoice(traj, frame, progress, lens.chosen, highlight) : null;
  const shown = choice?.cell && !lens?.closed ? choice : null;
  return (
    <>
      <defs>
        <clipPath id={clip} clipPathUnits="userSpaceOnUse">
          <path d={outside} clipRule="evenodd" />
        </clipPath>
      </defs>
      {Array.from({ length: layout.trees }, (_, t) => (
        <g key={t} transform={layout.treeTransform(t)} data-tree={t}>
          <StaticTree layout={layout} meta={traj.meta} tree={t} figure={figure} />
          <GateLayer layout={layout} meta={traj.meta} events={events} phase={cur.phase} pulse={pulse} tree={t} figure={figure} />
          <CellLayer
            layout={layout}
            traj={traj}
            branches={branches}
            events={events}
            pulse={pulse}
            tree={t}
            figure={figure}
            lights={lights}
            lensCell={shown?.cell?.l ?? null}
            onCell={view.lens ? lens?.ui?.onSelect : undefined}
          />
        </g>
      ))}
      <g clipPath={`url(#${clip})`} className="outside-cells">
        {view.traces && <TraceLayer traj={traj} layout={layout} frame={frame} highlight={highlight} />}
        <WalkerLayer
          layout={layout}
          branches={branches}
          labels={view.labels}
          traj={traj}
          opacityMode={view.opacity}
          highlight={highlight}
          figure={figure}
        />
      </g>
      <ClashLayer layout={layout} branches={branches} highlight={highlight} />
      {figure && <KetAnnotations layout={layout} traj={traj} frame={frame} branches={branches} view={view} />}
      {shown && (
        <CellLens traj={traj} layout={layout} frame={frame} progress={progress} view={view} highlight={highlight} choice={shown} pulse={pulse} ui={lens?.ui} />
      )}
    </>
  );
}

/** Where the lens is drawn when the view shows it for this trajectory (null: no lens). */
export function lensFrameOf(traj: Trajectory, layout: Layout, view: ViewOptions): (Rect & { scale: number }) | null {
  if (!view.lens || !hasLens(traj)) return null;
  return lensRect(layout, lensGeometry(traj.meta, layout.opts.sitePitch, manyCells(traj)), view.lensAt);
}

/** Whether the lens is drawn at this instant (it is open and the train is in a cell). */
export function lensShownAt(traj: Trajectory, frame: number, progress: number, view: ViewOptions, closed = false): boolean {
  return view.lens && !closed && lensCells(traj, frame, progress).length > 0;
}

export function useLensFrame(traj: Trajectory | null, layout: Layout | null, view: ViewOptions): (Rect & { scale: number }) | null {
  return useMemo(() => (traj && layout ? lensFrameOf(traj, layout, view) : null), [traj, layout, view]);
}

interface View {
  k: number;
  x: number;
  y: number;
}

export function TreeCanvas() {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const progress = usePlayback((s) => s.progress);
  const view = usePlayback((s) => s.view);
  const highlight = usePlayback((s) => s.highlight);
  const lensClosed = usePlayback((s) => s.lensClosed);
  const lensCell = usePlayback((s) => s.lensCell);
  const host = useRef<HTMLDivElement>(null);
  const svg = useRef<SVGSVGElement>(null);
  const [vp, setVp] = useState<View>({ k: 1, x: 0, y: 0 });
  const drag = useRef<{ x: number; y: number; vx: number; vy: number } | null>(null);
  const lensDrag = useRef<{ x: number; y: number; at: ViewOptions["lensAt"]; mode: "move" | "size"; w: number } | null>(null);

  const layout = useMemo(
    () => (traj ? layoutFor(traj, view) : null),
    // only these options change the layout
    [traj, view.mirror, view.spacing, view.orientation],
  );

  // Fit frames the drawing and, when the run reaches a cell, the lens.
  const reserve = traj && layout && view.lens && !lensClosed && hasLens(traj);
  const boundsRef = useRef<Rect | null>(null);
  const fit = useCallback(() => {
    if (!layout || !host.current) return;
    const { clientWidth: w, clientHeight: h } = host.current;
    const box = boundsRef.current ?? { x: 0, y: 0, w: layout.width, h: layout.height };
    const k = Math.min(w / box.w, h / box.h) * 0.98;
    setVp({ k, x: (w - box.w * k) / 2 - box.x * k, y: (h - box.h * k) / 2 - box.y * k });
  }, [layout, reserve]);

  useEffect(() => {
    fit();
    const el = host.current;
    if (!el) return;
    const ro = new ResizeObserver(() => fit());
    ro.observe(el);
    return () => ro.disconnect();
  }, [fit]);

  const lensFrame = useLensFrame(traj, layout, view);
  boundsRef.current = layout ? sceneBounds(layout, reserve ? lensFrame : null) : null;

  if (!traj || !layout) {
    return (
      <div className="canvas empty" ref={host}>
        <p className="muted">No trajectory loaded. Open “Setup” or pick a preset.</p>
      </div>
    );
  }
  const cur = traj.frames[frame]!;
  // what the exports frame: the drawing, and the lens when it is shown now
  const lensNow = !!lensFrame && lensShownAt(traj, frame, progress, view, lensClosed);
  const exportBounds = sceneBounds(layout, lensNow ? lensFrame : null);

  const s = usePlayback.getState();
  const ui: LensUi = {
    onClose: () => s.setLensClosed(true),
    onSelect: (l) => s.setLensCell(l),
    onDragStart: (e, mode) => {
      e.stopPropagation();
      (e.target as Element).setPointerCapture?.(e.pointerId);
      lensDrag.current = { x: e.clientX, y: e.clientY, at: view.lensAt, mode, w: lensFrame?.w ?? 1 };
    },
  };

  const onWheel = (e: React.WheelEvent) => {
    const rect = host.current!.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const f = Math.exp(-e.deltaY * 0.0015);
    setVp((v) => {
      const k = Math.min(20, Math.max(0.05, v.k * f));
      return { k, x: mx - ((mx - v.x) * k) / v.k, y: my - ((my - v.y) * k) / v.k };
    });
  };

  return (
    <div
      className={`canvas${view.figure ? " figure" : ""}`}
      ref={host}
      data-testid="tree-canvas"
      onWheel={onWheel}
      onPointerDown={(e) => {
        drag.current = { x: e.clientX, y: e.clientY, vx: vp.x, vy: vp.y };
        (e.target as Element).setPointerCapture?.(e.pointerId);
      }}
      onPointerMove={(e) => {
        const ld = lensDrag.current;
        if (ld) {
          const dx = (e.clientX - ld.x) / vp.k;
          const dy = (e.clientY - ld.y) / vp.k;
          if (ld.mode === "move") s.setView({ lensAt: { ...ld.at, dx: ld.at.dx + dx, dy: ld.at.dy + dy } });
          else s.setView({ lensAt: { ...ld.at, scale: Math.max(0.5, Math.min(4, (ld.at.scale * (ld.w + dx)) / ld.w)) } });
          return;
        }
        const d = drag.current;
        if (d) setVp((v) => ({ ...v, x: d.vx + e.clientX - d.x, y: d.vy + e.clientY - d.y }));
      }}
      onPointerUp={() => {
        drag.current = null;
        lensDrag.current = null;
      }}
      onDoubleClick={fit}
    >
      <svg ref={svg} width="100%" height="100%" role="img" aria-label="Binary tree with the walker train">
        <g className="scene-root" transform={`translate(${vp.x},${vp.y}) scale(${vp.k})`}>
          <TreeScene
            traj={traj}
            layout={layout}
            frame={frame}
            progress={progress}
            view={view}
            highlight={highlight}
            lens={{ chosen: lensCell, closed: lensClosed, ui }}
          />
        </g>
      </svg>
      {cur.omitted && (
        <div className="canvas-note" title="The trajectory stores only the largest-weight branches of each frame (record.max_frame_branches); metrics use the full state">
          {cur.omitted.count} more branch{cur.omitted.count > 1 ? "es" : ""} (weight {cur.omitted.weight.toExponential(1)}) not drawn
        </div>
      )}
      <div className="canvas-tools" onPointerDown={(e) => e.stopPropagation()}>
        <InfoButton anchor="ui-canvas" topic="the tree view" />
        <button className="btn icon" title="Zoom in" aria-label="Zoom in" onClick={() => setVp((v) => ({ ...v, k: v.k * 1.25 }))}>
          +
        </button>
        <button className="btn icon" title="Zoom out" aria-label="Zoom out" onClick={() => setVp((v) => ({ ...v, k: v.k / 1.25 }))}>
          −
        </button>
        <button className="btn" title="Fit the whole tree in the view (double-click also works)" onClick={fit}>
          Fit
        </button>
        <ExportMenu svg={svg} layout={layout} bounds={exportBounds} />
      </div>
    </div>
  );
}
