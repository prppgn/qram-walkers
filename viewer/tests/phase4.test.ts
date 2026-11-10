// Viewer support for the qudit and dual-rail variants (PLAN.md Phase 4): local-state
// helpers, stacked trees, tree-aware rendering, the cell output circuit, help anchors,
// the comparison table. Fixtures are engine runs of the presets qudit-short, dualrail
// and dualrail-backup (n = 2).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  anchorForEvent,
  gateAnchor,
  resourceRows,
  VARIANT_COMPARISON,
  type EngineResources,
} from "../src/components/panels/helpAnchors";
import { VARIANTS } from "../src/components/setup/configModel";
import { windowGroups } from "../src/layout/gates";
import { ketText } from "../src/layout/kets";
import { computeLayout, DEFAULT_LAYOUT } from "../src/layout/unfoldedH";
import {
  colourOf,
  compactGlyph,
  describeState,
  discClass,
  glyphOf,
  logicalOf,
  memoryGlyph,
  restSite,
  treeOf,
} from "../src/model/states";
import { checkTrajectory, type EventJSON, type Trajectory } from "../src/model/types";

type GateEventJSON = Extract<EventJSON, { kind: "gate" }>;
import { drawFrame } from "../src/playback/render";

function load(path: string): Trajectory {
  return checkTrajectory(JSON.parse(readFileSync(new URL(path, import.meta.url), "utf-8")));
}

const QS = load("./fixtures/qudit-short.traj.json");
const DR = load("./fixtures/dualrail.traj.json");
const DB = load("./fixtures/dualrail-backup.traj.json");

describe("local states", () => {
  it("decodes colour, logical bit, tree and glyph of every family", () => {
    expect(["E", "R", "B", "oR", "fB", "uR", "dB", "xR"].map((s) => colourOf(s as never))).toEqual([
      null, "R", "B", "R", "B", "R", "B", "R",
    ]);
    expect(logicalOf("oB")).toBe(0);
    expect(logicalOf("fR")).toBe(1);
    expect(logicalOf("R")).toBeNull();
    expect([treeOf("uB"), treeOf("dR"), treeOf("xB"), treeOf("R"), treeOf("fR")]).toEqual([0, 1, 2, 0, 0]);
    expect([glyphOf("fR"), glyphOf("oB"), glyphOf("uR"), glyphOf("dB"), glyphOf("E")]).toEqual(["●R", "○B", "↑R", "↓B", "∅"]);
    expect([compactGlyph("oR"), compactGlyph("fB"), compactGlyph("uR"), compactGlyph("xB")]).toEqual(["R", "B", "↑R", "aB"]);
  });

  it("draws qudit ○ hollow, ● filled, and the auxiliary rail dashed", () => {
    expect(discClass("oR")).toBe("s-R hollow");
    expect(discClass("fB")).toBe("s-B");
    expect(discClass("xR")).toBe("s-R aux");
    expect(discClass("E")).toBe("s-E");
    expect(describeState("dR")).toMatch(/↓ tree/);
    expect(describeState("oB")).toMatch(/logical 0/);
  });

  it("writes the memory qubits in each family's encoding", () => {
    expect([memoryGlyph("bosonic", 0), memoryGlyph("bosonic", 1)]).toEqual(["∅", "R"]);
    expect([memoryGlyph("qudit", 0), memoryGlyph("qudit", 1)]).toEqual(["○R", "●R"]);
    expect([memoryGlyph("dualrail", 0), memoryGlyph("dualrail", 1)]).toEqual(["R", "B"]);
  });
});

describe("fixtures of the new variants", () => {
  it("carry the family, the trees and the path offsets", () => {
    expect(QS.meta.family).toBe("qudit");
    expect(QS.meta.geometry.trees).toBe(1);
    expect(DR.meta.geometry.trees).toBe(2);
    expect(DB.meta.span).toBe(8); // 2(n + m)
    expect(DB.meta.K).toBe(12); // 3(n + m)
    const backups = DB.meta.slots.filter((s) => s.backup);
    expect(backups.every((s) => s.rail === "u" || s.rail === "d")).toBe(true);
    // Ã₁↑ and Ã₁↓ share a path offset, hence a lane site
    const [up, down] = backups;
    expect(up!.offset).toBe(down!.offset);
    expect(restSite(DB.meta, up!.k)).toBe(restSite(DB.meta, down!.k));
    expect(restSite(QS.meta, 0)).toBe(QS.meta.K);
  });

  it("print kets with the family glyphs and the rail of the backups", () => {
    const out = QS.frames[QS.frames.length - 1]!.branches[0]!;
    expect(ketText(out, QS.meta.slots)).toBe("|●R^{out}⟩_{D1} |●R^{out}⟩_{D0} |○R^{out}⟩_{A2} |●R^{out}⟩_{A1}");
    const first = DB.frames[0]!.branches[0]!;
    expect(ketText(first, DB.meta.slots, "train").startsWith("|↓R^{in}⟩_{A1} |↑R^{in}⟩_{Ã1↑} |↓R^{in}⟩_{Ã1↓}")).toBe(true);
  });
});

describe("stacked trees", () => {
  it("places the ↓ tree below the ↑ tree and the auxiliary rail just above the ↓ lane", () => {
    const single = computeLayout(QS.meta, DEFAULT_LAYOUT);
    const two = computeLayout(DR.meta, DEFAULT_LAYOUT);
    expect(single.trees).toBe(1);
    expect(two.trees).toBe(2);
    expect(two.height).toBeGreaterThan(2 * two.treeHeight);
    const pos: [number, number, number] = [3, 4, 2];
    const up = two.place(pos, 1, 0);
    const down = two.place(pos, 1, 1);
    const aux = two.place(pos, 1, 2);
    expect(down.x).toBe(up.x);
    expect(down.y - up.y).toBeCloseTo(two.treeShift(1));
    expect(aux.y).toBeLessThan(down.y);
    expect(aux.y).toBeGreaterThan(down.y - 20);
  });

  it("never reports a clash for the two backups of a carrier (different trees)", () => {
    const layout = computeLayout(DB.meta, DEFAULT_LAYOUT);
    let sharedSites = 0;
    DB.frames.forEach((f, i) => {
      for (const b of drawFrame(DB, layout, i, 1, true)) {
        expect(b.clashes).toEqual([]);
        const byPos = new Map<string, number[]>();
        for (const w of b.walkers) {
          const raw = f.branches.find((x) => x.id === b.id)!.walkers[w.k]!;
          if (!raw.pos || raw.pos[0] < 1) continue;
          const key = raw.pos.join(",");
          byPos.set(key, [...(byPos.get(key) ?? []), w.p.y]);
        }
        for (const ys of byPos.values()) {
          if (ys.length === 2) {
            sharedSites++;
            expect(ys[0]).not.toBe(ys[1]); // drawn on their own trees
          }
        }
      }
    });
    expect(sharedSites).toBeGreaterThan(0);
  });
});

describe("dual-rail output circuit", () => {
  const gateEvents = (traj: Trajectory, type: string): GateEventJSON[] =>
    traj.frames.flatMap((f) => f.events.filter((e): e is GateEventJSON => e.kind === "gate" && e.type === type));

  it("moves the data walker that read 0 from the ↓ lane to the ↑ lane (D33)", () => {
    // dualrail preset: b(11) = 0, so in the |11⟩ branch D₁ turns blue at the copy
    const d1 = DR.meta.slots.find((s) => s.name === "D_1")!.k;
    const hops = (type: string) => gateEvents(DR, type).flatMap((e) => e.changes.filter((c) => c.k === d1).map((c) => `${c.from}→${c.to}`));
    expect(hops("copy_global")).toEqual(["dR→dB"]);
    expect(hops("S_M")).toEqual(["dB→xR"]);
    expect(hops("S_M_dag")).toEqual(["xR→uB"]);
    expect(hops("X_c")).toEqual(["uB→uR"]);
    expect(DR.final.metrics.fidelity).toBeGreaterThan(1 - 1e-12);
  });

  it("explains the new gates with their own guide sections", () => {
    expect(gateAnchor("S_M")).toBe("gate-dr-out");
    expect(gateAnchor("X_c", "dualrail_backup")).toBe("gate-dr-out");
    expect(gateAnchor("U", "qudit_long")).toBe("gate-qudit-U");
    expect(gateAnchor("U_B", "qudit_short")).toBe("gate-qudit-short");
    expect(gateAnchor("U", "dualrail_basic")).toBe("gate-dr-U");
    expect(gateAnchor("copy_backup", "dualrail_backup")).toBe("gate-dr-backup");
    expect(gateAnchor("U", "basic")).toBe("gate-U");
    const scatter = QS.frames.flatMap((f) => f.events).find((e) => e.kind === "scatter") as EventJSON;
    expect(anchorForEvent(scatter, "qudit_short")).toBe("gate-qudit-short");
    expect(anchorForEvent(scatter)).toBe("gate-S");
  });
});

describe("windows, resources, comparison", () => {
  it("draws the qudit short-range windows on sites 2–1", () => {
    const groups = windowGroups(QS.meta);
    const uin = groups.find((g) => g.type === "U_in" && g.level === 1)!;
    const ub = groups.find((g) => g.type === "U_B" && g.level === 1)!;
    expect(uin.sites).toEqual([1, 2]);
    expect(ub.sites).toEqual([1, 2]);
    expect(ub.tip).toMatch(/control \(blue\) on site 2/);
  });

  it("counts the gates of both trees", () => {
    const row = (traj: Trajectory) =>
      resourceRows(traj.final.resources as EngineResources, traj.meta).find((r) => r.id === "gates")!;
    expect(row(DR)).toMatchObject({ engine: "6 Û⁽ᵈ⁾ + 6 Ŝ = 12 (2 trees)", paper: "12" });
    expect(row(DB)).toMatchObject({ engine: "6 Û_in + 6 Û_B + 6 Ŝ = 18 (2 trees)", paper: "18" });
    expect(row(QS)).toMatchObject({ engine: "3 Û_in + 3 Û_B + 3 Ŝ = 9", paper: "9" });
  });

  it("lists the six variants of the comparison table of the technical paper", () => {
    expect(VARIANT_COMPARISON.map((r) => r.variant).sort()).toEqual(VARIANTS.map((v) => v.id).sort());
    expect(VARIANT_COMPARISON.find((r) => r.variant === "qudit_short")).toMatchObject({ depth: "5n + 2m", path: "2n" });
    expect(VARIANT_COMPARISON.find((r) => r.variant === "dualrail_backup")).toMatchObject({ trees: 2, gates: "6(2ⁿ − 1)" });
  });
});
