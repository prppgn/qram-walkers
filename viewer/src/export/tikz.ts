// TikZ export of one frame (PLAN.md Phase 5): a standalone LaTeX file with the tree, the
// gate windows, the memory cells and the walkers, at the positions of the viewer's
// layout, so the authors can edit a frame for a paper. As on the screen, the walkers in a
// memory lane are inside their cell and not drawn; a cell the train has reached is shaded
// with its weight. Rendering only.
import { modulus } from "../layout/kets";
import { edgeKey, type Layout, type Point } from "../layout/unfoldedH";
import { windowGroups } from "../layout/gates";
import { colourOf, logicalOf, treeOf } from "../model/states";
import type { SlotJSON, Trajectory } from "../model/types";
import { cellLights } from "../playback/cells";
import type { DrawnBranch } from "../playback/render";

const num = (x: number): string => (Math.round(x * 100) / 100).toString();
const at = (p: Point): string => `(${num(p.x)},${num(p.y)})`;

function slotLatex(s: SlotJSON): string {
  const letter = s.backup ? `\\tilde{${s.register}}` : s.register;
  const arrow = s.rail === "u" ? "^{\\uparrow}" : s.rail === "d" ? "^{\\downarrow}" : "";
  return `${letter}_{${s.bit}}${arrow}`;
}

const gateLatex = (type: string, level: number): string =>
  type === "U" ? `\\hat U^{(${level})}` : type === "U_in" ? `\\hat U_{\\mathrm{in}}^{(${level})}` : `\\hat U_B^{(${level})}`;

export function tikzFrame(traj: Trajectory, layout: Layout, branches: DrawnBranch[], frame: number): string {
  const { meta } = traj;
  const cur = traj.frames[frame]!;
  const sides: ((p: Point) => Point)[] = layout.opts.mirror ? [(p) => p, layout.mirrorPoint] : [(p) => p];
  const lines: string[] = [];
  const shift = (t: number): Point => layout.across(layout.treeShift(t));
  const plus = (p: Point, q: Point): Point => ({ x: p.x + q.x, y: p.y + q.y });
  const lights = cellLights(traj, frame, 1);

  for (let t = 0; t < layout.trees; t++) {
    const s = shift(t);
    if (layout.trees > 1) lines.push(`% ${t === 0 ? "up" : "down"} tree (logical ${t})`);
    sides.forEach((m, si) => {
      for (const grp of windowGroups(meta)) {
        for (let l = 1; l <= 1 << (grp.level - 1); l++) {
          const e = layout.edges.get(edgeKey(grp.level, l))!;
          const a = plus(m(e.sites[grp.sites[0] - 1]!), s);
          const b = plus(m(e.sites[grp.sites[1] - 1]!), s);
          lines.push(`\\draw[gate] ${at(a)} -- ${at(b)};`);
        }
        const first = layout.edges.get(edgeKey(grp.level, 1))!;
        const p = plus(plus(m(first.sites[grp.sites[1] - 1]!), s), layout.across(grp.type === "U_in" ? -38 : -14));
        lines.push(`\\node[label] at ${at(p)} {$${gateLatex(grp.type, grp.level)}$};`);
      }
      for (const e of layout.edges.values()) {
        const pts = e.path.map((q) => at(plus(m(q), s))).join(" -- ");
        lines.push(`\\draw[${e.d > layout.n ? "lane" : "edge"}] ${pts};`);
      }
      for (const nd of layout.nodes) {
        const sym = si ? "\\hat S^\\dagger" : "\\hat S";
        lines.push(`\\node[snode] at ${at(plus(m(nd.p), s))} {$${sym}$};`);
      }
    });
    const showBits = layout.trees < 2 || t === 1;
    const data = meta.slots.filter((x) => x.role === "data");
    const vertical = layout.opts.orientation === "vertical";
    for (const c of layout.cells) {
      const a = plus({ x: c.box.x, y: c.box.y }, s);
      const b = plus({ x: c.box.x + c.box.w, y: c.box.y + c.box.h }, s);
      const arrow = layout.trees > 1 ? (t === 0 ? "\\,\\uparrow" : "\\,\\downarrow") : "";
      const lit = lights.find((x) => x.l === c.l && x.tree === t)?.lit ?? 0;
      const shade = lit > 0 ? `,fill=qlit,fill opacity=${num(0.2 + 0.8 * lit)}` : "";
      lines.push(`\\draw[cell${shade}] ${at(a)} rectangle ${at(b)};`);
      lines.push(`\\node[label] at ${at({ x: (a.x + b.x) / 2, y: a.y + 7 })} {$${c.address}${arrow}$};`);
      if (!showBits) continue;
      // the memory qubits in a row along the box, below the address (see the cell lens)
      data.forEach((slot, i) => {
        const bit = meta.memory[c.l - 1]?.[slot.bit - 1] ?? 0;
        const off = (i - (data.length - 1) / 2) * 7;
        const q = vertical ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 + 6 + off } : { x: (a.x + b.x) / 2 + off, y: b.y - 7 };
        lines.push(`\\node[membit${bit ? ",fill=qred" : ""}] at ${at(q)} {};`);
      });
    }
  }

  lines.push("% walkers");
  branches.forEach((b) => {
    const a = modulus(b.amp);
    const opacity = branches.length === 1 ? 1 : Math.max(0.18, Math.min(1, a * a * branches.length));
    const dim = opacity < 1 ? `,opacity=${num(opacity)}` : "";
    for (const w of b.walkers) {
      if (w.inCell) continue; // inside its cell
      const slot = meta.slots[w.k]!;
      const size = slot.backup ? "backup" : "walker";
      if (w.ghost) {
        lines.push(`\\node[${size},ghost${dim}] at ${at(w.p)} {};`);
      } else {
        const col = colourOf(w.s) === "B" ? "qblue" : "qred";
        const hollow = logicalOf(w.s) === 0;
        const style = hollow ? `draw=${col},fill=white,line width=1pt` : `fill=${col},text=white`;
        const aux = treeOf(w.s) === 2 ? ",dashed,draw=black" : "";
        const glyph = slot.backup ? "" : `\\tiny ${colourOf(w.s)}`;
        const ink = hollow ? `,text=${col}` : "";
        lines.push(`\\node[${size},${style}${ink}${aux}${dim}] at ${at(w.p)} {${glyph}};`);
      }
      const q = plus(w.p, { x: 0, y: -12 });
      lines.push(`\\node[label${dim}] at ${at(q)} {$${slotLatex(slot)}$};`);
    }
  });

  // Off the ideal path: stray walkers (D21) with a dashed ring, collisions (D26) as a cross.
  for (const b of branches) {
    for (const st of b.strays) {
      if (st.inCell) continue;
      const col = colourOf(st.s) === "B" ? "qblue" : "qred";
      lines.push(`\\node[walker,fill=${col},text=white] at ${at(st.p)} {\\tiny ${colourOf(st.s)}};`);
      lines.push(`\\node[strayring] at ${at(st.p)} {};`);
    }
    for (const c of b.clashes) lines.push(`\\node[clash] at ${at(c)} {};`);
  }

  const tick = cur.t < 0 ? "input state" : `tick ${cur.t}`;
  return `% Generated by qram-walkers: ${meta.variant} variant, n = ${meta.n}, m = ${meta.m}, ${tick} (${cur.phase}).
\\documentclass[tikz,border=4pt]{standalone}
\\usepackage{amsmath}
\\usetikzlibrary{shapes.misc}
\\definecolor{qred}{HTML}{D62728}
\\definecolor{qblue}{HTML}{1F77B4}
\\definecolor{qedge}{HTML}{6B6B72}
\\definecolor{qgate}{HTML}{2E9F43}
\\definecolor{qcell}{HTML}{ECE7DA}
\\definecolor{qlit}{HTML}{FFC94A}
\\definecolor{qstray}{HTML}{C2185B}
\\begin{document}
\\begin{tikzpicture}[x=0.028cm,y=-0.028cm,
  edge/.style={qedge,line width=0.7pt},
  lane/.style={qedge,line width=0.5pt},
  gate/.style={qgate,opacity=0.18,line width=7pt,line cap=round},
  snode/.style={circle,draw=qedge,fill=white,inner sep=0.2pt,minimum size=11pt,font=\\tiny},
  cell/.style={draw=qedge,fill=qcell,rounded corners=1pt},
  membit/.style={rectangle,draw=qred,fill=white,inner sep=0pt,minimum size=4pt},
  walker/.style={circle,inner sep=0pt,minimum size=11pt},
  backup/.style={circle,inner sep=0pt,minimum size=8pt},
  ghost/.style={draw=gray,dashed,fill=none},
  strayring/.style={circle,draw=qstray,dashed,inner sep=0pt,minimum size=15pt},
  clash/.style={cross out,draw=qstray,line width=1pt,inner sep=0pt,minimum size=14pt},
  label/.style={font=\\tiny,inner sep=0.5pt}]
${lines.join("\n")}
\\end{tikzpicture}
\\end{document}
`;
}
