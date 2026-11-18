// A ket in the paper's notation, typeset by KaTeX: coloured R/B, ∅, superscript (d,l)
// (primed in the inverse phase), subscript slot label. Used by the ket panel, the setup
// preview, the paper checkpoints and the video stage. `data-plain` carries the same ket as
// plain text (screen readers, tests).
import type { BranchJSON, SlotJSON } from "../model/types";
import type { KetOrder } from "../layout/kets";
import { ketPlain, ketTex, texHtml } from "../layout/ketTex";

export function Ket(props: { branch: BranchJSON; slots: SlotJSON[]; order: KetOrder; positions: boolean }) {
  const tex = ketTex(props.branch, props.slots, props.order, props.positions);
  const plain = ketPlain(props.branch, props.slots, props.order, props.positions);
  const notes = [
    props.branch.strays?.length ? "⊗ stray walkers created by a copy on an empty site" : "",
    props.branch.collided ? "two walkers met on one site: frozen, counted as a failure" : "",
    props.branch.cells?.on.length ? "F_on: the cell switches that are on in this branch" : "",
  ].filter(Boolean);
  return (
    <span
      className="ket"
      data-testid="ket"
      data-plain={plain}
      role="img"
      aria-label={plain}
      title={notes.length ? notes.join("; ") : undefined}
      dangerouslySetInnerHTML={{ __html: texHtml(tex) }}
    />
  );
}

/** Any formula of the panels, typeset by KaTeX. */
export function Tex({ tex, display = false, className }: { tex: string; display?: boolean; className?: string }) {
  return <span className={className ? `tex ${className}` : "tex"} dangerouslySetInnerHTML={{ __html: texHtml(tex, display) }} />;
}
