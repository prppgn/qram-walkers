// Where the tutorial's card goes, given the lit parts of the page (pure geometry).

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

const MARGIN = 12; // from the window's edges
const GAP = 14; // between the lit part and the card

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

function union(boxes: Box[]): Box {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return { x, y, w: Math.max(...boxes.map((b) => b.x + b.w)) - x, h: Math.max(...boxes.map((b) => b.y + b.h)) - y };
}

/** Where the card goes: beside, below or above the lit parts (all of them, then each one),
 *  inside the window and over none of them; first outside `avoid` (the tree, when the lit
 *  parts are in it) if there is room; failing all that, the bottom-right corner. */
export function placeCard(holes: Box[], cw: number, ch: number, W: number, H: number, avoid: Box | null = null): { x: number; y: number } {
  if (!holes.length) return { x: Math.max(MARGIN, (W - cw) / 2), y: Math.max(MARGIN, (H - ch) / 2) };
  const cx = (x: number) => Math.max(MARGIN, Math.min(W - cw - MARGIN, x));
  const cy = (y: number) => Math.max(MARGIN, Math.min(H - ch - MARGIN, y));
  const all = union(holes);
  const around = (u: Box) => [
    { x: u.x + u.w + GAP, y: cy(all.y) },
    { x: u.x - GAP - cw, y: cy(all.y) },
    { x: cx(all.x), y: u.y + u.h + GAP },
    { x: cx(all.x), y: u.y - GAP - ch },
  ];
  const passes: { at: Box[]; keepOff: Box[] }[] = [
    ...(avoid ? [{ at: [avoid], keepOff: [...holes, avoid] }] : []),
    { at: [all, ...holes], keepOff: holes },
  ];
  for (const { at, keepOff } of passes) {
    for (const u of at) {
      for (const t of around(u)) {
        const card = { x: t.x, y: t.y, w: cw, h: ch };
        const inside = t.x >= MARGIN && t.y >= MARGIN && t.x + cw <= W - MARGIN && t.y + ch <= H - MARGIN;
        if (inside && !keepOff.some((h) => overlaps(card, h))) return t;
      }
    }
  }
  return { x: cx(W - cw), y: cy(H - ch) };
}
