// Kets in the paper's notation, formatted from trajectory data (no physics).
// Same conventions as engine/src/qramsim/kets.py: |R^{d,l}⟩_{A1} for a walker on edge
// (d,l); |∅^{d}⟩ for an empty slot (level of its ghost); a prime on the level in the
// inverse phase (direction −1); "in"/"out" on the port line; default order tail → front.
import type { Amp, BranchJSON, LocalState, SlotJSON, WalkerJSON } from "../model/types";
import { glyphOf } from "../model/states";

export type KetOrder = "paper" | "train";

export interface KetToken {
  k: number;
  /** Glyph in the paper's notation: R, B, ∅, ○R, ●B, ↑R, ↓B … */
  glyph: string;
  /** Local state (E for an empty slot): colour classes come from it. */
  s: LocalState;
  sup: string;
  /** Compact slot label used in printed kets: A1, D0. */
  sub: string;
  /** Unicode slot label: A₁, D₀. */
  label: string;
}

export function walkerToken(w: WalkerJSON, slot: SlotJSON): KetToken {
  const arrow = slot.rail === "u" ? "↑" : slot.rail === "d" ? "↓" : "";
  const sub = `${slot.register}${slot.backup ? "\u0303" : ""}${slot.bit}${arrow}`.normalize("NFC");
  const present = w.s !== "E";
  const rec = present ? (w.pos ? { pos: w.pos, dir: w.dir ?? 1 } : null) : (w.ghost ?? null);
  let sup = "";
  if (rec) {
    const [level, branch] = rec.pos;
    const dir = "dir" in rec ? rec.dir : 1;
    const prime = dir < 0 ? "'" : "";
    if (level === 0) sup = dir < 0 ? "out" : "in";
    else sup = present ? `${level}${prime},${branch}` : `${level}${prime}`;
  }
  return { k: slot.k, glyph: present ? glyphOf(w.s) : "∅", s: present ? w.s : "E", sup, sub, label: slot.label };
}

export function ketTokens(branch: BranchJSON, slots: SlotJSON[], order: KetOrder = "paper"): KetToken[] {
  const tokens = branch.walkers.map((w) => walkerToken(w, slots[w.k]!));
  return order === "paper" ? tokens.reverse() : tokens;
}

/** Plain-text ket, identical to the engine's `ket_branch` output. */
export function ketText(branch: BranchJSON, slots: SlotJSON[], order: KetOrder = "paper"): string {
  const body = ketTokens(branch, slots, order)
    .map((t) => `|${t.glyph}${t.sup ? `^{${t.sup}}` : ""}⟩_{${t.sub}}`)
    .join(" ");
  const on = branch.cells?.on ?? [];
  return on.length ? `${body} ⊗ F_on{${on.join(",")}}` : body;
}

export function modulus(a: Amp): number {
  return Math.hypot(a[0], a[1]);
}

/** Phase in degrees, in [0, 360). */
export function phaseDeg(a: Amp): number {
  const deg = (Math.atan2(a[1], a[0]) * 180) / Math.PI;
  return ((deg % 360) + 360) % 360;
}

/** Amplitude as "0.7071" or "0.5000·e^{i 90°}". */
export function formatAmp(a: Amp): string {
  const r = modulus(a);
  const ph = phaseDeg(a);
  const rs = r.toFixed(4);
  if (Math.abs(ph) < 1e-6 || Math.abs(ph - 360) < 1e-6) return rs;
  if (Math.abs(ph - 180) < 1e-6) return `−${rs}`;
  return `${rs}·e^{i${ph.toFixed(0)}°}`;
}

/** Label of a branch: the engine's label if given (branches created by coherent errors,
 *  e.g. "|10⟩′3"), else the input address it carries (branch ids follow input terms). */
export function branchLabel(
  id: number,
  inputs: { id: number; address: string }[],
  labels?: Record<string, string>,
): string {
  const named = labels?.[String(id)];
  if (named) return named;
  const term = inputs.find((t) => t.id === id);
  return term ? `|${term.address}⟩` : `#${id}`;
}
