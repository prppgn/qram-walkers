// The cell lens: a box, tied to the cell the train has reached by a guide line, showing
// the inside of the cell as in the paper's figures of the copy. Its lane has the sites at
// the tree's scale; the memory qubits M_j sit beside the resting sites of the data walkers
// D_j (the switch F beside the flag D₀ in the cell-switch mode); each copy flashes on
// (M_j, D_j), and D_j becomes a ghost where b_j = 0. Walkers arrive in the tick in which
// they vanish into the cell on the tree; after the turn they go back along the same lane
// and leave through the entrance, tail first. A superposition that reaches several cells
// shows the heaviest one, with tabs for the others; highlighting a branch shows its cell.
// Positions come from lensScene (data only); this file only draws.
import { useId, useMemo, type PointerEvent as ReactPointerEvent } from "react";
import { modulus } from "../layout/kets";
import { lensGeometry, lensRect, lensScene, type LensGeom, type Rect } from "../layout/lens";
import { cellBoxes, type Layout, type Point } from "../layout/unfoldedH";
import { colourOf, describeState, discClass, memoryGlyph } from "../model/states";
import type { Trajectory } from "../model/types";
import { cellTargets, lensCells, manyCells, type LensCell } from "../playback/cells";
import type { ViewOptions } from "../playback/store";

const R = 7;
const RB = 5;
const MAX_TABS = 3;

/** What the canvas lets the lens do (absent in the exports and the video). */
export interface LensUi {
  onClose(): void;
  onSelect(l: number): void;
  onDragStart(e: ReactPointerEvent, mode: "move" | "size"): void;
}

export interface LensChoice {
  /** The cells holding a branch's train, heaviest first. */
  cells: LensCell[];
  /** The one shown. */
  cell: LensCell | null;
}

/** The cell shown: the highlighted branch's, else the one chosen, else the heaviest. */
export function lensChoice(traj: Trajectory, frame: number, progress: number, chosen: number | null, highlight: number | null): LensChoice {
  const cells = lensCells(traj, frame, progress);
  const target = highlight !== null ? cellTargets(traj).get(highlight) : undefined;
  const cell = cells.find((c) => c.l === target) ?? cells.find((c) => c.l === chosen) ?? cells[0] ?? null;
  return { cells, cell };
}

/** The lens geometry of a trajectory, at the layout's site pitch. */
export function useLensGeometry(traj: Trajectory, layout: Layout): LensGeom {
  return useMemo(() => lensGeometry(traj.meta, layout.opts.sitePitch, manyCells(traj)), [traj, layout]);
}

/** "Û_in⁽¹⁾" → Û with a real subscript "in" followed by the rest (the level, the operands). */
export function GateLabel({ label }: { label: string }) {
  const m = /^(.*?)_([A-Za-z]+)(.*)$/.exec(label);
  if (!m) return <>{label}</>;
  return (
    <>
      {m[1]}
      <tspan dy={3} fontSize="0.75em">
        {m[2]}
      </tspan>
      <tspan dy={-3}>{m[3]}</tspan>
    </>
  );
}

/** Point of the rectangle's border facing `towards`. */
function facing(r: Rect, towards: Point): Point {
  const cx = r.x + r.w / 2;
  const cy = r.y + r.h / 2;
  const dx = towards.x - cx;
  const dy = towards.y - cy;
  if (dx === 0 && dy === 0) return { x: cx, y: cy };
  const t = Math.min(Math.abs(dx) > 0 ? r.w / 2 / Math.abs(dx) : Infinity, Math.abs(dy) > 0 ? r.h / 2 / Math.abs(dy) : Infinity);
  return { x: cx + dx * t, y: cy + dy * t };
}

export function CellLens({
  traj,
  layout,
  frame,
  progress,
  view,
  highlight,
  choice,
  pulse,
  ui,
}: {
  traj: Trajectory;
  layout: Layout;
  frame: number;
  progress: number;
  view: ViewOptions;
  highlight: number | null;
  choice: LensChoice;
  pulse: number;
  ui?: LensUi;
}) {
  const g = useLensGeometry(traj, layout);
  const clip = `lens-${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const cell = choice.cell;
  if (!cell) return null;
  const meta = traj.meta;
  const cur = traj.frames[frame]!;
  const rect = lensRect(layout, g, view.lensAt);
  const scene = lensScene(traj, frame, progress, cell.l, view.ghosts, g);
  const address = meta.geometry.cells.find((c) => c.l === cell.l)?.address ?? "";
  const bits = meta.memory[cell.l - 1] ?? [];
  const several = choice.cells.length > 1;

  // the guide line, from the cell on the tree (the ↓ one for dual-rail) to the lens
  const box = cellBoxes(layout).find((b) => b.l === cell.l && b.tree === (layout.trees > 1 ? 1 : 0))!;
  const lensMid = { x: rect.x + rect.w / 2, y: rect.y + rect.h / 2 };
  const a = facing(box, lensMid);
  const b = facing(rect, { x: box.x + box.w / 2, y: box.y + box.h / 2 });

  // branches in the lens: heaviest first, a little apart across the lane, as on the tree
  const total = cur.branches.reduce((s, x) => s + modulus(x.amp) ** 2, 0) || 1;
  const weight = new Map(cur.branches.map((x) => [x.id, modulus(x.amp) ** 2 / total]));
  const amp = new Map(cur.branches.map((x) => [x.id, modulus(x.amp)]));
  const own = new Set(cell.branches);
  const ids = [...new Set(scene.walkers.map((w) => w.branch))].sort(
    (x, y) => Number(own.has(y)) - Number(own.has(x)) || (weight.get(y) ?? 0) - (weight.get(x) ?? 0),
  );
  const B = ids.length;
  const spread = Math.min(5, 12 / Math.max(B, 1));
  const nb = cur.branches.length;
  const opacityOf = (id: number): number => {
    if (highlight !== null) return highlight === id ? 1 : 0.08;
    if (nb === 1) return 1;
    const w = view.opacity === "prob" ? weight.get(id) ?? 0 : amp.get(id) ?? 0;
    return Math.max(0.18, Math.min(1, w * (view.opacity === "prob" ? nb : Math.sqrt(nb))));
  };

  const top = g.rows[0]!.y;
  const bottom = g.rows.at(-1)!.y;
  const header = 13;
  const tabsY = g.header + 10;
  const tabs = choice.cells.slice(0, MAX_TABS);
  const tabW = 6 * (meta.n + 8) + 8; // "|01⟩ 0.50" in the tab font
  // a walker resting on the same site in several branches is labelled once
  const labelled = new Set<string>();
  const labelOnce = (k: number, p: Point): boolean => {
    const key = `${k}:${Math.round(p.x)}`;
    if (labelled.has(key)) return false;
    labelled.add(key);
    return view.labels;
  };
  // walkers of branches whose train went elsewhere (dispersed address walkers) are faint
  const mine = own;
  return (
    <g className="lens-layer">
      <line x1={a.x} y1={a.y} x2={b.x} y2={b.y} className="lens-guide" />
      <g
        className="cell-lens"
        data-testid="cell-lens"
        data-cell={cell.l}
        data-phase={scene.turning ? "turn" : cur.phase}
        transform={`translate(${rect.x},${rect.y}) scale(${rect.scale})`}
      >
        <defs>
          <clipPath id={clip}>
            <rect x={0} y={0} width={g.w} height={g.h} rx={6} />
          </clipPath>
        </defs>
        <rect
          x={0}
          y={0}
          width={g.w}
          height={g.h}
          rx={6}
          className={ui ? "lens-frame movable" : "lens-frame"}
          onPointerDown={ui ? (e) => ui.onDragStart(e, "move") : undefined}
        >
          <title>{`Inside memory cell |${address}⟩: its lane at the tree's scale, the memory qubits and the walkers in it${ui ? ". Drag to move" : ""}`}</title>
        </rect>
        <text x={10} y={header} className="lens-title">
          {`cell |${address}⟩ · b = ${bits.join("")}`}
        </text>
        {ui && (
          <g
            className="lens-close"
            data-testid="lens-close"
            data-export="skip"
            transform={`translate(${g.w - 11},10)`}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={ui.onClose}
          >
            <circle r={7} />
            <text y={3.5} textAnchor="middle">
              ×
            </text>
            <title>Close the lens (click a lit cell, or set “cell lens” again, to open it)</title>
          </g>
        )}
        {g.tabs > 0 && several && (
          <g className="lens-tabs">
            {tabs.map((c, i) => {
              const addr = meta.geometry.cells.find((x) => x.l === c.l)?.address ?? "";
              return (
                <g
                  key={c.l}
                  className={`lens-tab${c.l === cell.l ? " active" : ""}${ui ? " clickable" : ""}`}
                  data-testid="lens-tab"
                  data-cell={c.l}
                  transform={`translate(${10 + i * (tabW + 4)},${tabsY - 11})`}
                  onPointerDown={ui ? (e) => e.stopPropagation() : undefined}
                  onClick={ui ? () => ui.onSelect(c.l) : undefined}
                >
                  <rect width={tabW} height={15} rx={3} />
                  <text x={tabW / 2} y={11} textAnchor="middle">{`|${addr}⟩ ${c.weight.toFixed(2)}`}</text>
                  <title>{`Cell |${addr}⟩, reached with |α|² = ${c.weight.toFixed(3)}${ui ? ": click to look inside" : ""}`}</title>
                </g>
              );
            })}
            {choice.cells.length > MAX_TABS && (
              <text x={10 + MAX_TABS * (tabW + 4)} y={tabsY} className="lens-text">{`+${choice.cells.length - MAX_TABS}`}</text>
            )}
          </g>
        )}

        {/* the lanes (dual-rail: ↑, auxiliary rail, ↓), entering from the left */}
        {g.rows.map((row) => (
          <g key={row.tree}>
            <path d={`M0,${row.y} H${g.laneEnd} M${g.laneEnd},${row.y - 8} V${row.y + 8}`} className={row.tree === 2 ? "lens-lane aux" : "lens-lane"} />
            {Array.from({ length: meta.geometry.memory_sites }, (_, i) => (
              <circle key={i} cx={g.siteX(i + 1)} cy={row.y} r={1.6} className="site" />
            ))}
            {row.label && (
              <text x={g.laneEnd + 8} y={row.y + 3.5} className="lens-text">
                {row.label}
              </text>
            )}
          </g>
        ))}

        {/* each copy flashes on its window, joining the memory qubit to the walker it acts on */}
        {scene.flashes.map((f) => (
          <g key={f.gate} className="lens-flash-group" style={{ opacity: 0.25 + 0.75 * pulse }}>
            <rect x={f.x0} y={top - 11} width={f.x1 - f.x0} height={bottom - top + 22} rx={9} className="lens-flash" data-testid="lens-flash" />
            {f.links.map((k, i) => (
              <line key={i} x1={k.a.x} y1={k.a.y} x2={k.b.x} y2={k.b.y} className="lens-link" />
            ))}
            <text x={10} y={g.caption} className="lens-gate">
              <GateLabel label={f.label} />
            </text>
          </g>
        ))}

        {g.memory.map((q) => {
          const bit = bits[q.bit - 1] ?? 0;
          const glyph = memoryGlyph(meta.family, bit);
          const flashing = scene.flashes.some((f) => f.links.some((k) => k.from === `M${q.bit}`));
          return (
            <g key={q.k} data-testid="lens-mem" transform={`translate(${q.x},${q.y})`} className={flashing ? "lens-mem flashing" : "lens-mem"}>
              <line x1={0} y1={bottom + R - q.y + 1} x2={0} y2={0} className="lens-tie" />
              <rect x={-10} y={0} width={20} height={14} rx={3} className={bit ? "one" : "zero"} />
              <text y={10.5} textAnchor="middle" className="lens-glyph">
                {glyph}
              </text>
              <text y={25} textAnchor="middle" className="lens-text">
                {q.label}
              </text>
              <title>{`${q.label} = ${glyph} (b${q.bit} = ${bit}), beside the resting site of D${q.bit}`}</title>
            </g>
          );
        })}
        {g.lamp && (
          <g transform={`translate(${g.lamp.x},${g.lamp.y})`} className="lens-lamp">
            <line x1={0} y1={bottom + R - g.lamp.y + 1} x2={0} y2={-7} className="lens-tie" />
            <circle r={6.5} className="switch" style={{ fillOpacity: 0.15 + 0.85 * scene.on }} />
            <text y={18} textAnchor="middle" className="lens-text">
              F
            </text>
            <title>{`Cell switch F, beside the resting site of the flag D₀: on with probability ${scene.on.toFixed(3)}`}</title>
          </g>
        )}

        <g clipPath={`url(#${clip})`}>
          {ids.map((id, bi) => {
            const dy = B > 1 ? (bi - (B - 1) / 2) * spread : 0;
            return (
              <g key={id} style={{ opacity: opacityOf(id) * (mine.has(id) || highlight === id ? 1 : 0.45) }} data-branch={id}>
                {scene.walkers
                  .filter((w) => w.branch === id)
                  .map((w) => {
                    const slot = meta.slots[w.k]!;
                    const at = `translate(${w.p.x},${w.p.y + dy})`;
                    const key = `${id}:${w.k}`;
                    if (w.ghost) {
                      return (
                        <g key={w.k} transform={at} className="ghost" data-testid="lens-ghost" data-k={w.k} data-key={key}>
                          <circle r={slot.backup ? RB : R} />
                          {labelOnce(w.k, w.p) && (
                            <text y={-R - 3} textAnchor="middle" className="walker-label">
                              {slot.label}
                            </text>
                          )}
                          <title>{`${slot.label}: empty slot |∅⟩ (ghost)`}</title>
                        </g>
                      );
                    }
                    return (
                      <g key={w.k} transform={at} className={`walker ${discClass(w.s)}`} data-testid="lens-walker" data-k={w.k} data-key={key} data-state={w.s}>
                        <circle r={slot.backup ? RB : R} className="disc" />
                        {slot.backup ? (
                          <circle r={1.6} className="backup-dot" />
                        ) : (
                          <text y={3.2} textAnchor="middle" className="walker-glyph">
                            {colourOf(w.s)}
                          </text>
                        )}
                        {labelOnce(w.k, w.p) && (
                          <text y={-R - 4} textAnchor="middle" className="walker-label">
                            {slot.label}
                          </text>
                        )}
                        <title>{`${slot.label}: ${describeState(w.s)}, branch ${id}`}</title>
                      </g>
                    );
                  })}
              </g>
            );
          })}
        </g>

        {ui && view.figure && (
          <path
            d={`M${g.w - 3},${g.h - 13} L${g.w - 3},${g.h - 3} L${g.w - 13},${g.h - 3} Z`}
            className="lens-resize"
            data-export="skip"
            onPointerDown={(e) => ui.onDragStart(e, "size")}
          >
            <title>Drag to resize the lens</title>
          </path>
        )}
      </g>
    </g>
  );
}
