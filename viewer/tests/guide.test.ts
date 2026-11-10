import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { renderMarkdown } from "../src/help/markdown";

const dir = new URL("../../docs/user-guide/", import.meta.url);
const pages = Object.fromEntries(
  readdirSync(dir)
    .filter((f) => f.endsWith(".md"))
    .map((f) => [f.replace(/\.md$/, ""), renderMarkdown(readFileSync(new URL(f, dir), "utf-8"))]),
);

// Anchors the viewer links to from ⓘ buttons and the narration's "Explain".
const REQUIRED: Record<string, string[]> = {
  start: ["start-tour", "start-help", "start-tasks"],
  controls: [
    "controls", "controls-topbar", "controls-tree", "controls-export", "controls-playback", "controls-state", "controls-panels",
    "controls-setup", "controls-input", "controls-memory", "controls-noise", "controls-options", "controls-presets",
    "controls-compare", "controls-guide",
  ],
  cli: ["cli", "cli-app", "cli-shortcut", "cli-run", "cli-figure", "cli-sweep", "cli-scaling", "cli-python"],
  protocol: ["overview", "train", "encoding", "tree", "clock", "phases", "routing", "query", "inverse", "ghosts", "kets"],
  variants: [
    "basic", "copy-global", "copy-cell-switch", "backup", "pipelining", "copy-backup", "other-variants",
    "qudit-short", "qudit-long", "dualrail-basic", "dualrail-backup", "dualrail-output", "comparison",
  ],
  gates: [
    "gate-X", "gate-U", "gate-S", "gate-S-dag", "gate-copy-loc", "gate-copy-global", "gate-cell-on", "gate-copy-cell",
    "gate-cell-off", "gate-U-in", "gate-U-B", "gate-copy-backup",
    "gate-qudit-X", "gate-qudit-U", "gate-qudit-S", "gate-qudit-short", "gate-qudit-copy",
    "gate-dr-U", "gate-dr-S", "gate-dr-copy", "gate-dr-out", "gate-dr-backup",
  ],
  metrics: ["fidelity", "success", "consistency", "entropy", "resources", "timing"],
  noise: [
    "noise-quantum-jumps", "noise-locations", "noise-targets", "noise-families", "noise-loss", "noise-heralding",
    "noise-logical-dephasing", "noise-logical-flip", "noise-bit-flip",
    "noise-colour-dephasing", "noise-presence-dephasing", "noise-depolarizing", "noise-scatter-flip",
    "noise-gate-failure", "noise-clock-jitter", "noise-copy-error", "noise-memory-bit-flip",
    "noise-strays", "noise-collisions", "noise-absorb", "noise-ensembles",
    "noise-overrotation", "noise-imbalance", "noise-pruning",
  ],
  ui: ["ui-canvas", "ui-export", "ui-figure", "ui-compare", "ui-static", "ui-playback", "ui-timeline", "ui-train", "ui-kets", "ui-phasors", "ui-narration", "ui-panels", "ui-events", "ui-legend", "ui-setup", "ui-memory", "ui-themes", "ui-keyboard", "ui-qudit", "ui-dualrail", "ui-lens"],
};

describe("user guide", () => {
  it("has every page with its required anchors", () => {
    for (const [page, anchors] of Object.entries(REQUIRED)) {
      expect(pages[page], page).toBeDefined();
      for (const a of anchors) expect(pages[page]!.anchors, `${page}#${a}`).toContain(a);
    }
  });

  it("has unique anchors across pages", () => {
    const all = Object.values(pages).flatMap((p) => p.anchors);
    expect(new Set(all).size).toBe(all.length);
  });

  it("renders all math without KaTeX errors and leaves no placeholders", () => {
    for (const [name, p] of Object.entries(pages)) {
      expect(p.html, name).not.toContain("katex-error");
      expect(p.html, name).not.toMatch(/@@(MATH|CODE)\d+@@/);
      expect(p.html, name).toContain('class="katex');
    }
  });

  it("converts the paragraph right after a heading (bold, links, tables)", () => {
    const p = renderMarkdown("## A {#a}\n\n**bold** [link](gates.md#gate-U)\n\n| x | y |\n|---|---|\n| 1 | 2 |\n");
    expect(p.html).toContain("<strong>bold</strong>");
    expect(p.html).toContain('href="gates.md#gate-U"');
    expect(p.html).toContain("<table>");
    expect(p.anchors).toContain("a");
  });

  it("resolves every cross-page link to an existing anchor", () => {
    const anchors = new Set(Object.values(pages).flatMap((p) => p.anchors));
    for (const [name, p] of Object.entries(pages)) {
      for (const m of p.html.matchAll(/href="(?:\.\/)?([\w-]+)\.md(?:#([\w-]+))?"/g)) {
        expect(pages[m[1]!], `${name} → ${m[0]}`).toBeDefined();
        if (m[2]) expect(anchors.has(m[2]), `${name} → ${m[0]}`).toBe(true);
      }
    }
  });
});
