// A ket in the paper's notation: coloured R/B, bold ∅, superscript (d,l) (primed in
// the inverse phase), subscript slot label. Used by the ket panel, the setup preview
// and the paper checkpoints.
import type { BranchJSON, SlotJSON } from "../model/types";
import { ketTokens, type KetOrder } from "../layout/kets";
import { colourOf, glyphOf } from "../model/states";

export function Ket(props: {
  branch: BranchJSON;
  slots: SlotJSON[];
  order: KetOrder;
  positions: boolean;
}) {
  const tokens = ketTokens(props.branch, props.slots, props.order);
  const on = props.branch.cells?.on ?? [];
  return (
    <span className="ket" data-testid="ket">
      {tokens.map((t) => (
        <span key={t.k} className="ket-factor">
          |<span className={`g-${colourOf(t.s) ?? "E"}`}>{t.glyph}</span>
          {props.positions && t.sup && <sup>{t.sup}</sup>}⟩<sub>{t.label}</sub>
        </span>
      ))}
      {(props.branch.strays ?? []).map((st, i) => {
        const prime = st.dir < 0 ? "'" : "";
        const sup = st.pos[0] === 0 ? (st.dir < 0 ? "out" : "in") : `${st.pos[0]}${prime},${st.pos[1]}`;
        const owner = st.k >= 0 ? props.slots[st.k]?.label : undefined;
        return (
          <span key={`s${i}`} className="ket-stray" title="Stray walker created by a copy on an empty site">
            {" "}⊗ |<span className={`g-${colourOf(st.s) ?? "E"}`}>{glyphOf(st.s)}</span>
            {props.positions && <sup>{sup}</sup>}⟩<sub>{owner ? `stray(${owner})` : "stray"}</sub>
          </span>
        );
      })}
      {props.branch.collided && (
        <span className="ket-collided" title="Two walkers met on one site: frozen, counted as failure">
          {" "}[collided]
        </span>
      )}
      {on.length > 0 && (
        <span className="muted" title="Cell switches F that are on in this branch">
          {" "}
          ⊗ F<sub>on</sub>({on.join(",")})
        </span>
      )}
    </span>
  );
}
