// The cell lens: the cell swallows the train on the tree, the lens shows its inside.
// (a) no walker jumps, across the whole run and through the inversion (render page);
// (b) the lens opens at the first walker in the cell, shows the m memory qubits and the
//     walkers in lane order, flashes at each copy and shows the ghost of D_j where b_j = 0;
// (c) a superposition lights two cells with different opacities, and the tabs change cell;
// and an SVG export with the lens open that opens as an image.
import { expect, test, type Page } from "@playwright/test";

interface Walker {
  s: string;
  pos?: number[];
}
interface Traj {
  meta: { n: number; m: number; slots: { register: string }[] };
  frames: { t: number; phase: string; branches: { id: number; walkers: Walker[] }[] }[];
}

async function trajectory(page: Page, name: string): Promise<Traj> {
  const presets = (await (await page.request.get("/api/presets")).json()) as { name: string; config: unknown }[];
  const reply = await page.request.post("/api/simulate", { data: presets.find((p) => p.name === name)!.config });
  return (await reply.json()) as Traj;
}

/** The cell each branch's data walkers sit in at the query, and the frame where the first
 *  walker of the branch enters that cell. */
function firstEntry(t: Traj): number {
  const lane = t.meta.n + 1;
  const query = t.frames.find((f) => f.phase === "query")!;
  const target = new Map<number, number>();
  for (const b of query.branches) {
    const d = b.walkers.find((w, k) => t.meta.slots[k]!.register === "D" && w.s !== "E" && w.pos?.[0] === lane);
    if (d) target.set(b.id, d.pos![1]!);
  }
  return t.frames.findIndex((f) =>
    f.branches.some((b) => b.walkers.some((w) => w.s !== "E" && w.pos?.[0] === lane && w.pos[1] === target.get(b.id))),
  );
}

async function loadPreset(page: Page, name: string) {
  await page.goto("/");
  await expect(page.getByTestId(`preset-${name}`)).toBeEnabled();
  await page.getByTestId(`preset-${name}`).click();
  await expect(page.getByTestId("frame-counter")).toContainText("input");
  await page.getByTestId("mode-tick").click();
}

async function stepTo(page: Page, t: Traj, frame: number) {
  // frame 0 is the input state; in tick mode each step is one frame, either way
  const tickOf = (text: string | null) => (/tick (\d+)/.exec(text ?? "")?.[1] ? Number(/tick (\d+)/.exec(text!)![1]) : -1);
  const want = t.frames[frame]!.t;
  for (let i = 0; i < 2 * t.frames.length; i++) {
    const now = tickOf(await page.getByTestId("frame-counter").textContent());
    if (now === want) break;
    await page.getByTestId(now < want ? "step-forward" : "step-back").click();
  }
  await expect(page.getByTestId("frame-counter")).toContainText(want < 0 ? "input" : `tick ${want} `);
}

const lens = (page: Page) => page.locator(".canvas [data-testid='cell-lens']");

for (const name of ["E1", "E2"]) {
  test(`${name}: no walker jumps, through the whole run and the inversion`, async ({ page }) => {
    test.setTimeout(120_000);
    await page.goto("/?render");
    const t = await trajectory(page, name);
    await page.waitForFunction(() => !!window.__qram);
    const frames = await page.evaluate((traj) => window.__qram!.load(traj), t);
    const SUB = 8;
    const report = await page.evaluate(
      async ([frames, SUB]) => {
        const api = window.__qram!;
        const { step } = api.geometry();
        const total = (frames - 1) * SUB + 1;
        const read = (sel: string) => {
          const out = new Map<string, [number, number]>();
          for (const g of document.querySelectorAll(sel)) {
            const m = /translate\(([-\d.e]+),\s*([-\d.e]+)\)/.exec(g.getAttribute("transform") ?? "");
            if (m) out.set(g.getAttribute("data-key")!, [Number(m[1]), Number(m[2])]);
          }
          return out;
        };
        let worstSub = 0;
        let worstTick = 0;
        let lensMovesAtTurn = 0;
        let prev: Map<string, [number, number]> | null = null;
        let prevTick: Map<string, [number, number]> | null = null;
        let lensPrev: Map<string, [number, number]> | null = null;
        for (let i = 0; i < total; i++) {
          await api.seekVideo(i, total, 0, 0);
          const now = read(".render-canvas .walkers [data-key]");
          if (prev) {
            for (const [k, p] of now) {
              const q = prev.get(k);
              if (q) worstSub = Math.max(worstSub, Math.hypot(p[0] - q[0], p[1] - q[1]));
            }
          }
          prev = now;
          if (i % SUB === 0) {
            if (prevTick) {
              for (const [k, p] of now) {
                const q = prevTick.get(k);
                if (q) worstTick = Math.max(worstTick, Math.hypot(p[0] - q[0], p[1] - q[1]));
              }
            }
            prevTick = now;
          }
          // in the lens, nothing moves while the walkers turn (the query tick that flips them)
          const lensNow = read(".render-canvas [data-testid='cell-lens'] [data-key]");
          const phase = document.querySelector(".render-canvas [data-testid='cell-lens']")?.getAttribute("data-phase");
          if (lensPrev && phase === "turn") {
            for (const [k, p] of lensNow) {
              const q = lensPrev.get(k);
              if (q) lensMovesAtTurn = Math.max(lensMovesAtTurn, Math.hypot(p[0] - q[0], p[1] - q[1]));
            }
          }
          lensPrev = lensNow;
        }
        return { step, worstSub, worstTick, lensMovesAtTurn, samples: total };
      },
      [frames, SUB] as const,
    );
    expect(report.samples).toBeGreaterThan(100);
    expect(report.worstTick).toBeGreaterThan(0);
    expect(report.worstTick).toBeLessThanOrEqual(report.step + 0.01);
    // linear within each tick: no snap halfway
    expect(report.worstSub).toBeLessThanOrEqual(report.step / SUB + 0.01);
    expect(report.lensMovesAtTurn).toBeLessThan(0.01);
  });
}

for (const name of ["E1", "E2"]) {
  test(`${name}: the lens opens at the first walker in the cell, with the memory, the train in order and the copy`, async ({ page }) => {
    test.setTimeout(90_000);
    await loadPreset(page, name);
    const t = await trajectory(page, name);
    const first = firstEntry(t);
    await stepTo(page, t, first - 1);
    await expect(lens(page)).toHaveCount(0);
    await expect(page.locator(".canvas .cell-lit")).toHaveCount(0);
    await stepTo(page, t, first);
    await expect(lens(page)).toHaveCount(1);
    await expect(page.locator(".canvas .cell-lit").first()).toBeAttached();
    await expect(lens(page).getByTestId("lens-mem")).toHaveCount(t.meta.m);
    // the cell counts the walkers inside
    await expect(page.locator(".canvas .cell-count").first()).toBeAttached();

    const query = t.frames.findIndex((f) => f.phase === "query");
    await stepTo(page, t, query - 1);
    await expect(lens(page).getByTestId("lens-flash")).toHaveCount(0);
    for (let f = query; t.frames[f]!.phase === "query"; f++) {
      await stepTo(page, t, f);
      await expect(lens(page).getByTestId("lens-flash").first()).toBeAttached();
      await expect(page.locator(".canvas .cell-active").first()).toBeAttached();
    }
    // the train in lane order: the tail nearest the entrance (left), the front deepest
    const order = await lens(page)
      .locator("[data-testid='lens-walker'], [data-testid='lens-ghost']")
      .evaluateAll((els) =>
        els
          .map((e) => ({ k: Number(e.getAttribute("data-k")), x: Number(/translate\(([-\d.e]+)/.exec(e.getAttribute("transform") ?? "")![1]) }))
          .sort((a, b) => a.x - b.x)
          .map((w) => w.k),
      );
    expect(order.length).toBeGreaterThan(1);
    expect(order).toEqual([...order].sort((a, b) => b - a));

    if (name === "E2") {
      // |11⟩ reaches cell 4, which stores b = 0: D₁ becomes |∅⟩ at the copy (a ghost)
      await page.locator(".canvas [data-testid='lens-tab'][data-cell='4']").click();
      await expect(lens(page)).toHaveAttribute("data-cell", "4");
      await expect(lens(page).locator("[data-testid='lens-ghost'][data-k='3']")).toHaveCount(1);
      await stepTo(page, t, query - 1);
      await expect(lens(page).locator("[data-testid='lens-walker'][data-k='3']")).toHaveCount(1);
    }

    // closed with a click; the toggle in the view options brings it back
    await lens(page).getByTestId("lens-close").click();
    await expect(lens(page)).toHaveCount(0);
    await page.getByTestId("lens-toggle").uncheck();
    await page.getByTestId("lens-toggle").check();
    await expect(lens(page)).toHaveCount(1);
  });
}

test("a superposition lights two cells with different opacities; the tabs and the kets change cell", async ({ page }) => {
  await loadPreset(page, "E2");
  await page.getByTestId("open-setup").click();
  await expect(page.getByTestId("term-row")).toHaveCount(2);
  await page.getByTestId("term-row").nth(1).getByTitle(/Relative modulus r of this term \(0–1\)/).fill("0.5");
  await page.getByTestId("setup-run").click();
  await expect(page.getByTestId("setup-drawer")).toBeHidden();
  await page.getByTestId("mode-tick").click();
  await page.getByTitle(/Jump to the start of the query/).click();

  const lit = page.locator(".canvas .cell-lit");
  await expect(lit).toHaveCount(2);
  const opacities = await lit.evaluateAll((els) => els.map((e) => Number(getComputedStyle(e).fillOpacity)));
  expect(Math.abs(opacities[0]! - opacities[1]!)).toBeGreaterThan(0.2);

  // the heavier branch (|00⟩, 4/5) shows first; its tab comes first
  await expect(lens(page)).toHaveAttribute("data-cell", "1");
  const tabs = lens(page).getByTestId("lens-tab");
  await expect(tabs).toHaveCount(2);
  await expect(tabs.first()).toHaveAttribute("data-cell", "1");
  await tabs.nth(1).click();
  await expect(lens(page)).toHaveAttribute("data-cell", "4");
  await tabs.nth(0).click();
  await expect(lens(page)).toHaveAttribute("data-cell", "1");

  // highlighting a branch (a ket) opens its cell
  await page.getByTestId("ket-row").nth(1).click();
  await expect(lens(page)).toHaveAttribute("data-cell", "4");
  await page.getByTestId("ket-row").nth(1).click();
  await expect(lens(page)).toHaveAttribute("data-cell", "1");
});

test("an SVG export with the lens open contains the lens and opens as an image", async ({ page }) => {
  await loadPreset(page, "E2");
  await page.getByTitle(/Jump to the start of the query/).click();
  await expect(lens(page)).toHaveCount(1);
  await page.getByTestId("export-open").click();
  const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId("export-svg-talk").click()]);
  const chunks: Buffer[] = [];
  for await (const c of await dl.createReadStream()) chunks.push(Buffer.from(c));
  const text = Buffer.concat(chunks).toString("utf-8");
  expect(text).toContain("cell |00⟩");
  expect(text).toContain("M₁");
  expect(text).not.toMatch(/var\(--|class="|data-testid/);
  expect(text).not.toContain("×"); // the close button is not exported
  const image = await page.evaluate(async (svg) => {
    const doc = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (doc.querySelector("parsererror")) return { ok: false, w: 0, h: 0, vb: "" };
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml" }));
    const img = new Image();
    img.src = url;
    await img.decode();
    return { ok: true, w: img.naturalWidth, h: img.naturalHeight, vb: doc.documentElement.getAttribute("viewBox") ?? "" };
  }, text);
  expect(image.ok).toBe(true);
  expect(image.w).toBeGreaterThan(100);
  expect(image.h).toBeGreaterThan(100);
});

test("in figure mode the kets of a train inside its cell stay off the cells", async ({ page }) => {
  await loadPreset(page, "E2");
  await page.getByTestId("figure-mode").check();
  await page.getByTitle(/Jump to the start of the query/).click();
  const kets = page.locator(".canvas .ket-annotation");
  await expect(kets).toHaveCount(2);
  const overlaps = await page.evaluate(() => {
    const boxes = [...document.querySelectorAll(".canvas .cell-group")].map((g) => g.getBoundingClientRect());
    return [...document.querySelectorAll(".canvas .ket-annotation")].flatMap((k) => {
      const r = k.getBoundingClientRect();
      return boxes.filter((b) => r.left < b.right && b.left < r.right && r.top < b.bottom && b.top < r.bottom).map(() => k.textContent);
    });
  });
  expect(overlaps).toEqual([]);
});
