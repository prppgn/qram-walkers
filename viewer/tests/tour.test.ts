// The tutorial's steps (written for E1) and where its card goes.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { overlaps, placeCard, type Box } from "../src/components/tour/place";
import { TOUR_STEPS } from "../src/components/tour/steps";
import { proseParts } from "../src/layout/proseTex";
import { checkTrajectory } from "../src/model/types";

const E1 = checkTrajectory(JSON.parse(readFileSync(new URL("../../engine/tests/golden/E1.traj.json", import.meta.url), "utf-8")));

describe("tutorial steps", () => {
  it("has eight steps in the agreed order", () => {
    expect(TOUR_STEPS.map((s) => s.id)).toEqual(["tree", "train", "switch", "gate", "cells", "words", "controls", "more"]);
  });

  it("shows the frames its text talks about on E1", () => {
    const at = Object.fromEntries(TOUR_STEPS.map((s) => [s.id, s.frame(E1)]));
    expect(at.tree).toBe(0);
    expect(at.train).toBe(0);
    // Û⁽¹⁾ fires (A₁ red: D₀, D₁ turn blue) and A₁ crosses node (1,1)
    const f = E1.frames[at.gate!]!;
    expect(f.events.some((e) => e.kind === "gate" && e.type === "U" && e.level === 1 && e.fired_in.length > 0)).toBe(true);
    expect(f.events.some((e) => e.kind === "scatter")).toBe(true);
    expect(at.switch).toBe(at.gate);
    // D₀ and D₁ blue after Û⁽¹⁾
    const states = Object.fromEntries(f.branches[0]!.walkers.map((w) => [w.k, w.s]));
    expect([states[2], states[3]]).toEqual(["B", "B"]);
    expect(E1.frames[at.cells!]!.phase).toBe("query");
    // the address of E1 and the bit in cell 10, as the text says
    expect(E1.meta.input_normalised[0]!.address).toBe("10");
    expect(E1.meta.memory[2]).toEqual([1]);
  });

  it("typesets every symbol of its text (no raw scripts left)", () => {
    for (const s of TOUR_STEPS) {
      for (const text of [s.title, s.text]) {
        const words = proseParts(text)
          .filter((p) => p.t === "text")
          .map((p) => p.v)
          .join("");
        expect(words, s.id).not.toMatch(/[\^_]|[₀-₉]|⟩|\|R|\|B|Û|Ŝ/);
      }
    }
  });
});

describe("tutorial card placement", () => {
  const W = 1440;
  const H = 900;
  const card = { w: 360, h: 300 };
  const inside = (p: { x: number; y: number }) => p.x >= 0 && p.y >= 0 && p.x + card.w <= W && p.y + card.h <= H;
  const box = (p: { x: number; y: number }): Box => ({ ...p, ...card });

  it("never covers a lit part and stays in the window", () => {
    const cases: Box[][] = [
      [{ x: 10, y: 50, w: 1010, h: 700 }],
      [{ x: 80, y: 280, w: 130, h: 50 }],
      [{ x: 10, y: 770, w: 1060, h: 50 }, { x: 1090, y: 50, w: 340, h: 860 - 50 }],
      [{ x: 10, y: 8, w: 90, h: 30 }, { x: 1300, y: 8, w: 120, h: 30 }],
    ];
    for (const holes of cases) {
      const p = placeCard(holes, card.w, card.h, W, H);
      expect(inside(p)).toBe(true);
      for (const h of holes) expect(overlaps(box(p), h)).toBe(false);
    }
  });

  it("keeps off the tree when there is room beside it", () => {
    const tree = { x: 10, y: 50, w: 1010, h: 700 };
    const p = placeCard([{ x: 80, y: 280, w: 130, h: 50 }], card.w, card.h, W, H, tree);
    expect(overlaps(box(p), tree)).toBe(false);
    // no room: it goes over the tree, but not over the lit part
    const narrow = { x: 0, y: 40, w: 1000, h: 520 };
    const q = placeCard([{ x: 80, y: 280, w: 130, h: 50 }], card.w, card.h, 1000, 800, narrow);
    expect(overlaps(box(q), { x: 80, y: 280, w: 130, h: 50 })).toBe(false);
  });

  it("centres the card when nothing is lit", () => {
    expect(placeCard([], 360, 300, 1440, 900)).toEqual({ x: 540, y: 300 });
  });
});
