// Legend (DESIGN.md §7.4–7.5): what every glyph of the tree view means. Static; the
// glyphs mimic the canvas using the theme tokens.
import type { ReactNode } from "react";
import { usePlayback } from "../../playback/store";
import { InfoButton, Panel } from "../Panel";
import { Scripted } from "./KetPanel";
import "./panels.css";

const W = 44;
const H = 26;

function Glyph({ children, label }: { children: ReactNode; label: string }) {
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {children}
    </svg>
  );
}

function Walker({ cx, cls, letter }: { cx: number; cls: string; letter: string }) {
  return (
    <g>
      <circle cx={cx} cy={H / 2} r={7} className={cls} />
      <text x={cx} y={H / 2 + 3.2} textAnchor="middle" className={cls.includes("hollow") ? "lg-glyph lg-glyph-red" : "lg-glyph"}>
        {letter}
      </text>
    </g>
  );
}

/** Which runs an item applies to. */
type When = "cell_switch" | "backup" | "bosonic" | "qudit" | "dualrail";

interface Item {
  key: string;
  glyph: ReactNode;
  label: string;
  text: ReactNode;
  anchor?: string;
  when?: When;
}

const ITEMS: Item[] = [
  {
    key: "red",
    label: "red walker",
    glyph: <Walker cx={W / 2} cls="lg-red" letter="R" />,
    text: (
      <>
        <b>|R⟩</b> red walker. Ŝ sends it to the left child (bit 0). An address walker present = address bit 1.
      </>
    ),
    anchor: "encoding",
  },
  {
    key: "blue",
    label: "blue walker",
    glyph: <Walker cx={W / 2} cls="lg-blue" letter="B" />,
    text: (
      <>
        <b>|B⟩</b> blue walker (colour flipped by Û⁽ᵈ⁾). Ŝ sends it to the right child (bit 1) and resets it to red.
      </>
    ),
    anchor: "encoding",
  },
  {
    key: "ghost",
    label: "ghost of an empty slot",
    glyph: <circle cx={W / 2} cy={H / 2} r={7} className="lg-ghost" />,
    text: (
      <>
        Ghost: an empty slot <b>|∅⟩</b> drawn where it would be. Rendering only; not part of the quantum state.
      </>
    ),
    anchor: "ghosts",
    when: "bosonic",
  },
  {
    key: "qudit",
    label: "qudit walkers",
    glyph: (
      <g>
        <Walker cx={13} cls="lg-red" letter="R" />
        <Walker cx={32} cls="lg-hollow-red" letter="R" />
      </g>
    ),
    text: (
      <>
        Qudit walker: filled disc = logical 1 (<b>●</b>), hollow disc = logical 0 (<b>○</b>); the colour is the routing
        colour. Left <b>|●R⟩</b>, right <b>|○R⟩</b>.
      </>
    ),
    anchor: "ui-qudit",
    when: "qudit",
  },
  {
    key: "dualrail",
    label: "dual-rail trees",
    glyph: (
      <g>
        <line x1={4} y1={7} x2={W - 4} y2={7} className="lg-edge" />
        <line x1={4} y1={H - 7} x2={W - 4} y2={H - 7} className="lg-edge" />
        <circle cx={14} cy={7} r={5} className="lg-red" />
        <circle cx={30} cy={H - 7} r={5} className="lg-red" />
        <circle cx={30} cy={H - 13} r={4} className="lg-aux" />
      </g>
    ),
    text: (
      <>
        Dual-rail: two stacked trees, <b>↑</b> (logical 0) on top and <b>↓</b> (logical 1) below; a walker is drawn on the tree
        of its rail. Dashed outline: the auxiliary rail of the cell output circuit.
      </>
    ),
    anchor: "ui-dualrail",
    when: "dualrail",
  },
  {
    key: "ring",
    label: "phase ring",
    glyph: (
      <g>
        <circle cx={13} cy={H / 2} r={9} fill="none" strokeWidth={2.2} style={{ stroke: "hsl(0, 75%, 50%)" }} />
        <circle cx={13} cy={H / 2} r={6} className="lg-red" />
        <circle cx={32} cy={H / 2} r={9} fill="none" strokeWidth={2.2} style={{ stroke: "hsl(180, 75%, 50%)" }} />
        <circle cx={32} cy={H / 2} r={6} className="lg-red" opacity={0.5} />
      </g>
    ),
    text: "Phase ring (superpositions): hue = arg α of the branch; opacity ∝ |α|² (or |α|, option).",
    anchor: "ui-canvas",
  },
  {
    key: "window",
    label: "gate window",
    glyph: (
      <g>
        <rect x={3} y={H / 2 - 5} width={W - 6} height={10} rx={3} className="lg-band" />
        <line x1={2} y1={H / 2} x2={W - 2} y2={H / 2} className="lg-edge" />
        {[8, 16, 24, 32, 40].map((x) => (
          <circle key={x} cx={x - 2} cy={H / 2} r={1.6} className="lg-site" />
        ))}
      </g>
    ),
    text: "Û⁽ᵈ⁾ window: sites of a level-d edge where the address-transmission gate acts (control A_d).",
    anchor: "gate-U",
  },
  {
    key: "backup",
    label: "backup walker",
    glyph: (
      <g>
        <circle cx={15} cy={H / 2} r={5} className="lg-red" />
        <circle cx={15} cy={H / 2} r={1.6} fill="#fff" />
        <circle cx={30} cy={H / 2} r={5} className="lg-blue" />
        <circle cx={30} cy={H / 2} r={1.6} fill="#fff" />
      </g>
    ),
    text: "Backup walker Ã_i, D̃_j (backup variants; dual-rail: one per tree, Ã_i↑ and Ã_i↓): smaller disc with a white dot; it carries the address bit along the train.",
    anchor: "gate-U-B",
    when: "backup",
  },
  {
    key: "backup-windows",
    label: "Û_in and Û_B windows",
    glyph: (
      <g>
        <line x1={2} y1={H / 2} x2={W - 2} y2={H / 2} className="lg-edge" />
        <rect x={8} y={H / 2 - 6} width={30} height={12} rx={3} className="lg-band" />
        <rect x={8} y={H / 2 - 4} width={20} height={8} rx={3} style={{ fill: "var(--gate-in)" }} />
        {[8, 18, 28, 38].map((x) => (
          <circle key={x} cx={x} cy={H / 2} r={1.6} className="lg-site" />
        ))}
      </g>
    ),
    text: "Backup variant, 4-site edges: Û_in on sites 3–2 (orange: A_d → Ã_d), Û_B on sites 4–2 (green: a blue backup flips the next pair).",
    anchor: "gate-U-in",
    when: "backup",
  },
  {
    key: "trace",
    label: "trace of an address walker",
    glyph: <path d={`M4,${H - 6} L20,${H / 2} L40,6`} fill="none" strokeDasharray="3 3" strokeWidth={1.4} style={{ stroke: "var(--accent)" }} />,
    text: "Trace (toggle “traces”): the path already travelled by an address walker; it shows where the dispersed ones went.",
    anchor: "routing",
  },
  {
    key: "stray",
    label: "stray walker",
    glyph: (
      <g>
        <circle cx={W / 2} cy={H / 2} r={10} fill="none" strokeWidth={2} strokeDasharray="3 2" style={{ stroke: "var(--noise)" }} />
        <circle cx={W / 2} cy={H / 2} r={7} className="lg-red" />
      </g>
    ),
    text: "Stray walker (noisy runs): created by a copy on a site where no walker of the train sits (|∅⟩ → |R⟩); it shares a slot's time bin.",
    anchor: "noise-strays",
  },
  {
    key: "clash",
    label: "collision",
    glyph: (
      <path d={`M${W / 2 - 8},${H / 2 - 8} L${W / 2 + 8},${H / 2 + 8} M${W / 2 + 8},${H / 2 - 8} L${W / 2 - 8},${H / 2 + 8}`} strokeWidth={3} strokeLinecap="round" style={{ stroke: "var(--noise)" }} />
    ),
    text: "Collision (noisy runs): two walkers on one site; the branch is frozen, drawn grey and counted as a failure.",
    anchor: "noise-collisions",
  },
  {
    key: "flash",
    label: "gate flash",
    glyph: (
      <g>
        <rect x={3} y={H / 2 - 5} width={17} height={10} rx={3} className="lg-flash-act" />
        <rect x={24} y={H / 2 - 5} width={17} height={10} rx={3} className="lg-flash-idle" />
      </g>
    ),
    text: "Gate flash: amber = the gate acted (control present in ≥ 1 branch); grey = fired idle (control ∅ everywhere → identity).",
    anchor: "ui-canvas",
  },
  {
    key: "node",
    label: "scattering nodes",
    glyph: (
      <g>
        <circle cx={12} cy={H / 2} r={8} className="lg-node" />
        <text x={12} y={H / 2 + 2.6} textAnchor="middle" className="lg-node-text">
          Ŝ
        </text>
        <circle cx={32} cy={H / 2} r={8} className="lg-node" />
        <text x={32} y={H / 2 + 2.6} textAnchor="middle" className="lg-node-text">
          Ŝ†
        </text>
      </g>
    ),
    text: "Ŝ at each bifurcation of the input tree; Ŝ† on the mirrored output tree merges the paths (red from the right child turns blue).",
    anchor: "gate-S",
  },
  {
    key: "memory",
    label: "memory qubits",
    glyph: (
      <g>
        <rect x={9} y={H / 2 - 5} width={10} height={10} className="lg-bit-one" />
        <rect x={25} y={H / 2 - 5} width={10} height={10} className="lg-bit-zero" />
      </g>
    ),
    text: "Memory qubits M_j beside the lane: filled = stored bit 1, empty = bit 0.",
    anchor: "gate-copy-loc",
  },
  {
    key: "lamp",
    label: "cell switch lamp",
    when: "cell_switch",
    glyph: (
      <g>
        <rect x={4} y={3} width={W - 8} height={H - 6} rx={4} className="lg-cell" />
        <circle cx={15} cy={H / 2} r={5} className="lg-lamp" />
        <circle cx={29} cy={H / 2} r={5} className="lg-lamp-off" />
      </g>
    ),
    text: "Cell switch F (cell-switch mode): lit in proportion to the probability that it is on.",
    anchor: "copy-cell-switch",
  },
  {
    key: "ports",
    label: "input and output ports",
    glyph: (
      <g>
        <polygon points={`4,${H / 2 - 5} 13,${H / 2} 4,${H / 2 + 5}`} className="lg-port" />
        <text x={7} y={H - 1} className="lg-text">
          in
        </text>
        <polygon points={`31,${H / 2 - 5} 40,${H / 2} 31,${H / 2 + 5}`} className="lg-port" />
        <text x={31} y={H - 1} className="lg-text">
          out
        </text>
      </g>
    ),
    text: "Input port (left): the train enters front first. Output port (right): the return trip drawn on the mirrored tree; physically the same port.",
    anchor: "faq-mirrored-tree",
  },
];

export function Legend() {
  const copyMode = usePlayback((s) => s.traj?.meta.copy_mode);
  const variant = usePlayback((s) => s.traj?.meta.variant);
  const family = usePlayback((s) => s.traj?.meta.family);
  const applies = (when: When | undefined): boolean => {
    if (when === undefined || variant === undefined) return true;
    if (when === "cell_switch") return copyMode === "cell_switch";
    if (when === "backup") return variant === "backup" || variant === "dualrail_backup";
    return family === when;
  };
  return (
    <Panel title="Legend" help="ui-legend" helpTopic="the legend" testId="legend-panel">
      <div className="pn-legend">
        {ITEMS.map((it) => {
          const off = !applies(it.when);
          return (
            <div key={it.key} style={{ display: "contents" }}>
              <span style={off ? { opacity: 0.4 } : undefined}>
                <Glyph label={it.label}>{it.glyph}</Glyph>
              </span>
              <span className={off ? "muted" : undefined}>
                {typeof it.text === "string" ? <Scripted text={it.text} /> : it.text}
                {off && " Not used in this run."}
                {it.anchor && <InfoButton anchor={it.anchor} topic={it.label} />}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
