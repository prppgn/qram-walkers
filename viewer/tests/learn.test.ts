// Learn: the ten chapters, their animations (runs the engine computed, bundled with the page),
// the glossary, and the plain/technical wording of the sentences.
import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { plainOf, skipsFor } from "../src/components/glossary/Glossed";
import { glossPieces, TERMS } from "../src/components/glossary/terms";
import { captionAt } from "../src/export/video";
import { renderMath, renderMarkdown } from "../src/help/markdown";
import { CHAPTERS, GLOSSARY_PAGE } from "../src/learn/chapters";
import { pageOfHash } from "../src/learn/route";
import { LEARN_RUNS, loadLearnTraj } from "../src/learn/trajectories";
import { checkTrajectory, type Trajectory } from "../src/model/types";
import { registerOf } from "../src/playback/store";

const dir = new URL("../../docs/user-guide/", import.meta.url);
const ANCHORS = new Set(
  readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .flatMap((f) => renderMarkdown(readFileSync(new URL(f, dir), "utf-8")).anchors),
);
const words = (s: string) => s.split(/\s+/).filter(Boolean).length;

describe("Learn chapters", () => {
  it("has the ten chapters of the plan, in order", () => {
    expect(CHAPTERS.map((c) => c.title)).toEqual([
      "Why a quantum RAM",
      "Walkers on a tree",
      "Colour decides the turn",
      "The address walker instructs the others",
      "Reading a memory cell",
      "Coming back: time reversal",
      "Superpositions of addresses",
      "When things go wrong: noise",
      "Six ways to build it: the variants",
      "Where to go next",
    ]);
    expect(new Set(CHAPTERS.map((c) => c.id)).size).toBe(10);
    expect(CHAPTERS.map((c) => c.id)).not.toContain(GLOSSARY_PAGE);
  });

  it.each(CHAPTERS.map((c) => [c.id, c] as const))("%s: 150–300 plain words, formulas that typeset, a guide page", (_, c) => {
    const n = words(c.body.map(plainOf).join(" "));
    expect(n).toBeGreaterThanOrEqual(150);
    expect(n).toBeLessThanOrEqual(300);
    expect(c.formulas.length).toBeGreaterThan(0);
    for (const f of c.formulas) {
      const html = renderMath(f.tex, true);
      expect(html).not.toContain("katex-error");
      expect(f.note.length).toBeGreaterThan(0);
    }
    expect(ANCHORS.has(c.guide), c.guide).toBe(true);
    // every [[id|…]] names a term of the glossary
    for (const p of c.body) for (const m of p.matchAll(/\[\[([\w-]+)/g)) expect(TERMS.some((t) => t.id === m[1])).toBe(true);
  });

  it("animates and offers to try a bundled run of every chapter, with n ≤ 2", async () => {
    for (const c of CHAPTERS) {
      expect(LEARN_RUNS).toContain(c.clip.traj);
      expect(LEARN_RUNS).toContain(c.tryIt.traj);
      const t = checkTrajectory(await loadLearnTraj(c.clip.traj));
      expect(t.meta.n).toBeLessThanOrEqual(2);
      expect(c.clip.from).toBeGreaterThanOrEqual(0);
      expect(c.clip.to).toBeGreaterThan(c.clip.from);
      expect(c.clip.to).toBeLessThan(t.frames.length);
    }
  });

  it("shows what the texts say", async () => {
    const at = (id: string) => CHAPTERS.find((c) => c.id === id)!;
    const ev = (t: Trajectory, from: number, to: number) => t.frames.slice(from, to + 1).flatMap((f) => f.events);
    // chapter 4: both Û gates of E1 fire inside the clip
    const e1 = await loadLearnTraj("E1");
    const u = ev(e1, at("instruct").clip.from, at("instruct").clip.to).filter((e) => e.kind === "gate" && e.type === "U");
    expect(u.map((e) => (e.kind === "gate" ? e.level : 0))).toEqual([1, 2]);
    // chapter 5: the copy of E1b fires inside the clip, with the lens
    const e1b = await loadLearnTraj("E1b");
    const read = at("read");
    expect(read.clip.lens).toBe(true);
    expect(ev(e1b, read.clip.from, read.clip.to).some((e) => e.kind === "gate" && e.gate === "copy_D1")).toBe(true);
    expect(e1b.meta.memory).toEqual([[0], [0], [0], [0]]);
    // chapter 6: the whole return of E1
    expect(e1.frames[at("return").clip.from]!.phase).toBe("query");
    expect(at("return").clip.to).toBe(e1.frames.length - 1);
    // chapter 7: four addresses with equal weights, cells 1, 0, 1, 1
    const u2 = await loadLearnTraj("uniform-n2");
    expect(u2.meta.input_normalised.map((x) => x.address).sort()).toEqual(["00", "01", "10", "11"]);
    expect(u2.meta.memory).toEqual([[1], [0], [1], [1]]);
    expect(u2.final.metrics.fidelity).toBeCloseTo(1, 12);
    // chapter 8: D₁ lost, fidelity 0
    const loss = await loadLearnTraj("noise-loss");
    expect(ev(loss, 0, loss.frames.length - 1).some((e) => e.kind === "noise")).toBe(true);
    expect(loss.final.metrics.fidelity).toBeCloseTo(0, 12);
    // chapters 9 and 10: the backup and the dual-rail variants
    expect((await loadLearnTraj("E3")).meta.variant).toBe("backup");
    expect((await loadLearnTraj("dualrail")).meta.variant).toBe("dualrail_basic");
  });

  it("has a plain sentence for every event of every bundled run", async () => {
    for (const name of LEARN_RUNS) {
      const t = await loadLearnTraj(name);
      for (const f of t.frames) for (const e of f.events) expect(e.text_plain, `${name}: ${e.text}`).toBeTruthy();
    }
  });

  it("opens at #learn and #learn/<page>", () => {
    expect(pageOfHash("#learn")).toBe("why");
    expect(pageOfHash("#learn/noise")).toBe("noise");
    expect(pageOfHash("#learn/glossary")).toBe("glossary");
    expect(pageOfHash("")).toBeNull();
    expect(pageOfHash("#gate-U")).toBeNull();
  });
});

describe("glossary", () => {
  it("defines at least twenty terms, each linked to a page of the guide", () => {
    expect(TERMS.length).toBeGreaterThanOrEqual(20);
    expect(new Set(TERMS.map((t) => t.id)).size).toBe(TERMS.length);
    for (const t of TERMS) {
      expect(ANCHORS.has(t.anchor), `${t.id} → ${t.anchor}`).toBe(true);
      expect(t.text.length).toBeGreaterThan(20);
    }
  });

  it("finds terms in running text: the longest phrase, once per block", () => {
    const seen = new Set<string>();
    const parts = glossPieces("The address walker steers the data walkers; every walker moves.", seen);
    expect(parts.filter((p) => p.term).map((p) => [p.text, p.term])).toEqual([
      ["address walker", "address-walker"],
      ["data walkers", "data-walker"],
      ["walker", "walker"],
    ]);
    // a second block with the same set marks nothing again
    expect(glossPieces("The address walker again.", seen).some((p) => p.term)).toBe(false);
  });

  it("does not take the left branch of the tree for a branch of the state", () => {
    const parts = glossPieces("A red walker takes the left branch; each branch of the state", new Set());
    const branch = parts.filter((p) => p.term === "branch");
    expect(branch).toHaveLength(1);
    expect(parts.map((p) => p.text).join("")).toBe("A red walker takes the left branch; each branch of the state");
  });

  it("marks a term only in the first paragraph that uses it", () => {
    const skips = skipsFor(["The train enters.", "The train leaves; a [[cell|cell]] is read."]);
    expect(skips[0]!.size).toBe(0);
    expect(skips[1]!.has("train")).toBe(true);
  });

  it("reads markup as plain text", () => {
    expect(plainOf("the [[S|scattering gate Ŝ]] and the [[tree]]")).toBe("the scattering gate Ŝ and the tree");
  });
});

describe("wording", () => {
  it("follows the mode unless forced", () => {
    expect(registerOf("simple", "auto")).toBe("plain");
    expect(registerOf("advanced", "auto")).toBe("technical");
    expect(registerOf("simple", "technical")).toBe("technical");
    expect(registerOf("advanced", "plain")).toBe("plain");
  });

  it("captions a frame in either register", async () => {
    const t = await loadLearnTraj("E1");
    const f = t.frames.findIndex((x) => x.events.some((e) => e.kind === "gate" && e.type === "U"));
    const tech = captionAt(t, f, "technical");
    const plain = captionAt(t, f, "plain");
    expect(tech).toContain("Û");
    expect(plain).not.toBe(tech);
    expect(captionAt(t, 0, "plain")).toMatch(/input port/);
  });
});
