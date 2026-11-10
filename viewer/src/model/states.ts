// Local states of the three walker families, as the engine writes them in trajectories
// as short strings: bosonic E, R, B; qudit oR, oB, fR, fB (○/● × colour); dual-rail
// uR, uB, dR, dB (↑/↓ × colour) and xR, xB on the auxiliary rail of the cell output
// circuit. Rendering helpers only: no physics here.
import type { LocalState, MetaJSON } from "./types";

export type Colour = "R" | "B";

/** Routing colour of a present walker; null for an empty slot. */
export function colourOf(s: LocalState): Colour | null {
  if (s === "E") return null;
  return s.endsWith("B") ? "B" : "R";
}

/** Logical bit of a qudit (○ = 0, ● = 1); null for other families. */
export function logicalOf(s: LocalState): 0 | 1 | null {
  if (s === "oR" || s === "oB") return 0;
  if (s === "fR" || s === "fB") return 1;
  return null;
}

/** Tree a walker is drawn on: dual-rail ↑ = 0, ↓ = 1, auxiliary rail = 2; else 0. */
export function treeOf(s: LocalState): 0 | 1 | 2 {
  if (s === "dR" || s === "dB") return 1;
  if (s === "xR" || s === "xB") return 2;
  return 0;
}

const GLYPH: Record<LocalState, string> = {
  E: "∅",
  R: "R",
  B: "B",
  oR: "○R",
  oB: "○B",
  fR: "●R",
  fB: "●B",
  uR: "↑R",
  uB: "↑B",
  dR: "↓R",
  dB: "↓B",
  xR: "aux R",
  xB: "aux B",
};

/** Glyph in the paper's notation: ∅, R, ●B, ↑R … */
export function glyphOf(s: LocalState): string {
  return GLYPH[s] ?? s;
}

/** Short text inside a small disc: the colour for qudits (fill shows ○/●), the rail and
 *  colour for dual-rail (↑R, ↓B, aR on the auxiliary rail), else the glyph. */
export function compactGlyph(s: LocalState): string {
  if (logicalOf(s) !== null) return colourOf(s)!;
  if (treeOf(s) === 2) return `a${colourOf(s)}`;
  return glyphOf(s);
}

/** CSS classes of a walker disc: colour (s-R / s-B, s-E), hollow for a qudit ○, aux. */
export function discClass(s: LocalState): string {
  const c = colourOf(s);
  const parts = [c ? `s-${c}` : "s-E"];
  if (logicalOf(s) === 0) parts.push("hollow");
  if (treeOf(s) === 2) parts.push("aux");
  return parts.join(" ");
}

/** Short words for a local state, for tooltips. */
export function describeState(s: LocalState): string {
  const c = colourOf(s);
  if (!c) return "empty slot |∅⟩";
  const colour = c === "R" ? "red" : "blue";
  const q = logicalOf(s);
  if (q !== null) return `|${glyphOf(s)}⟩: logical ${q} (${q ? "●" : "○"}), ${colour}`;
  const t = treeOf(s);
  if (s.length === 2) {
    const rail = t === 2 ? "auxiliary rail" : t === 1 ? "↓ tree (logical 1)" : "↑ tree (logical 0)";
    return `|${glyphOf(s)}⟩: ${colour}, on the ${rail}`;
  }
  return `|${s}⟩: ${colour}`;
}

/** Lane site where slot k rests during the query (engine `rest_site`: span − offset). */
export function restSite(meta: MetaJSON, k: number): number {
  const span = meta.span ?? meta.K;
  const offset = meta.slots[k]?.offset ?? k;
  return span - offset;
}

/** How a memory qubit storing `bit` is written in this family. */
export function memoryGlyph(family: string, bit: number): string {
  if (family === "qudit") return bit ? "●R" : "○R";
  if (family === "dualrail") return bit ? "B" : "R";
  return bit ? "R" : "∅";
}
