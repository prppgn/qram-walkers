// Level of detail of the tree's text (layout/lod.ts): at a large zoom everything is shown,
// and as the zoom shrinks labels are shortened, then dropped, never drawn under 13 px.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { gateSpots, lodClasses, lodFor, MIN_TEXT_PX, screenPx, WALKER_GLYPH } from "../src/layout/lod";
import { computeLayout, DEFAULT_LAYOUT } from "../src/layout/unfoldedH";
import { checkTrajectory, type Trajectory } from "../src/model/types";

function load(path: string): Trajectory {
  return checkTrajectory(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8")));
}
const E1 = load("../../engine/tests/golden/E1.traj.json");
const E3 = load("./fixtures/E3.traj.json");
const DR = load("./fixtures/dualrail.traj.json");
const QS = load("./fixtures/qudit-short.traj.json");

const horizontal = (t: Trajectory) => computeLayout(t.meta, { ...DEFAULT_LAYOUT });
const rank = { long: 2, all: 2, short: 1, main: 1, none: 0 } as const;

describe("level of detail of the tree's text", () => {
  it("shows everything when the tree is large", () => {
    for (const t of [E1, E3, DR, QS]) {
      const L = horizontal(t);
      expect(lodClasses(lodFor(L, 4, 1, gateSpots(L, t.meta)))).toBe("");
    }
  });

  it("drops the letters inside shapes below 13 px instead of shrinking them", () => {
    const L = horizontal(E1);
    expect(lodFor(L, MIN_TEXT_PX / WALKER_GLYPH + 0.01).glyph).toBe(true);
    expect(lodFor(L, MIN_TEXT_PX / WALKER_GLYPH - 0.01).glyph).toBe(false);
    expect(screenPx(8, 0.5)).toBe(MIN_TEXT_PX);
  });

  it("only removes detail as the zoom shrinks", () => {
    for (const t of [E1, E3, DR, QS]) {
      const L = horizontal(t);
      const spots = gateSpots(L, t.meta);
      let prev = lodFor(L, 4, 1, spots);
      for (let k = 4; k > 0.2; k *= 0.9) {
        const lod = lodFor(L, k, 1, spots);
        for (const key of ["node", "glyph", "walkerLabels"] as const) if (lod[key]) expect(prev[key]).toBe(true);
        for (const key of ["cellLabels", "levels", "ports", "gates"] as const) expect(rank[lod[key]]).toBeLessThanOrEqual(rank[prev[key]]);
        prev = lod;
      }
      expect(prev.levels).not.toBe("long");
    }
  });

  it("places one gate label per window and side", () => {
    const L = horizontal(QS);
    const spots = gateSpots(L, QS.meta);
    expect(spots.length).toBeGreaterThan(0);
    expect(spots.length % 2).toBe(0); // mirrored drawing: forward and inverse side
    expect(spots.some((s) => s.input)).toBe(true);
  });
});
