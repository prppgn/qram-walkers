// Kets as TeX, typeset by KaTeX like every formula of the viewer: |R^{2,1}⟩_{D_1}, with the
// colour of a walker as a CSS class (g-R, g-B, g-E) so that the themes colour it. Built from
// the same tokens as the plain kets (kets.ts); no physics.
import type { BranchJSON, SlotJSON } from "../model/types";
import { colourOf, glyphOf } from "../model/states";
import { ketTokens, type KetOrder, type KetToken } from "./kets";
export { texHtml } from "./tex";

/** TeX of a slot label: A_1, \tilde{D}_2, \tilde{A}_1^{\uparrow}. */
export function slotTex(slot: Pick<SlotJSON, "register" | "bit" | "backup" | "rail">): string {
  const reg = slot.backup ? `\\tilde{${slot.register}}` : slot.register;
  const arrow = slot.rail === "u" ? "^{\\uparrow}" : slot.rail === "d" ? "^{\\downarrow}" : "";
  return `${reg}_{${slot.bit}}${arrow}`;
}

const SYMBOL: Record<string, string> = { "∅": "\\varnothing", "○": "\\circ", "●": "\\bullet", "↑": "\\uparrow", "↓": "\\downarrow" };

/** TeX of a glyph: ∅, R, ○R, ↑B, aux R. */
export function glyphTex(glyph: string): string {
  if (glyph.startsWith("aux ")) return `\\text{aux}\\,\\mathrm{${glyph.slice(4)}}`;
  return [...glyph].map((c) => SYMBOL[c] ?? `\\mathrm{${c}}`).join("");
}

function supTex(sup: string): string {
  if (!sup) return "";
  if (sup === "in" || sup === "out") return `^{\\text{${sup}}}`;
  return `^{${sup}}`;
}

function factor(t: KetToken, slot: SlotJSON, positions: boolean): string {
  const g = `\\htmlClass{g-${colourOf(t.s) ?? "E"}}{${glyphTex(t.glyph)}}`;
  return `\\lvert ${g}${positions ? supTex(t.sup) : ""}\\rangle_{${slotTex(slot)}}`;
}

/** TeX of the ket of a branch, with its strays, collision mark and cell switches. */
export function ketTex(branch: BranchJSON, slots: SlotJSON[], order: KetOrder, positions: boolean): string {
  const parts = ketTokens(branch, slots, order).map((t) => factor(t, slots[t.k]!, positions));
  for (const st of branch.strays ?? []) {
    const prime = st.dir < 0 ? "'" : "";
    const sup = st.pos[0] === 0 ? (st.dir < 0 ? "out" : "in") : `${st.pos[0]}${prime},${st.pos[1]}`;
    const owner = st.k >= 0 ? slots[st.k] : undefined;
    const sub = owner ? `\\text{stray}(${slotTex(owner)})` : "\\text{stray}";
    const g = `\\htmlClass{g-${colourOf(st.s) ?? "E"}}{${glyphTex(glyphOf(st.s))}}`;
    parts.push(`\\otimes\\lvert ${g}${positions ? supTex(sup) : ""}\\rangle_{${sub}}`);
  }
  if (branch.collided) parts.push("\\;[\\text{collided}]");
  const on = branch.cells?.on ?? [];
  if (on.length) parts.push(`\\otimes F_{\\text{on}}(${on.join(",")})`);
  return parts.join("\\,");
}

/** The same ket as plain text (for tests, tooltips and screen readers): |R2,1⟩D₁ … */
export function ketPlain(branch: BranchJSON, slots: SlotJSON[], order: KetOrder, positions: boolean): string {
  const body = ketTokens(branch, slots, order).map((t) => `|${t.glyph}${positions ? t.sup : ""}⟩${t.label}`);
  if (branch.collided) body.push("[collided]");
  return body.join(" ");
}
