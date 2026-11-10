// Phase 1 acceptance: load E1, step by gate to the end and check the
// final ket; switch theme; add a superposition term and see two branches with phase
// rings; every control has a tooltip and every panel an ⓘ.
import { expect, test, type Page } from "@playwright/test";

const compact = (s: string | null) => (s ?? "").replace(/\s+/g, "");

async function loadPreset(page: Page, name: string) {
  await page.getByTestId(`preset-${name}`).click();
  await expect(page.getByTestId("frame-counter")).toContainText("input");
}

test("E1: step by gate to the end, final ket matches the paper", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId(`preset-E1`)).toBeEnabled();
  await loadPreset(page, "E1");
  await page.getByTestId("mode-gate").click();
  const counter = page.getByTestId("frame-counter");
  const stops: string[] = [];
  for (let i = 0; i < 10; i++) {
    const before = await counter.textContent();
    await page.getByTestId("step-forward").click();
    const after = await counter.textContent();
    if (after === before) break;
    stops.push(after ?? "");
  }
  // Û⁽¹⁾ (routing), the copy (query), Û⁽¹⁾ again (inverse), then the end
  expect(stops.length).toBe(4);
  await expect(counter).toContainText("tick 22 / 22");
  const rows = page.getByTestId("ket-row");
  await expect(rows).toHaveCount(1);
  expect(compact(await rows.first().textContent())).toContain("|Rout⟩D₁|Rout⟩D₀|∅out⟩A₂|Rout⟩A₁");
  await expect(page.getByTestId("narration")).toContainText("leaves the tree");
});

test("theme switch", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled();
  const html = page.locator("html");
  const first = await html.getAttribute("data-theme");
  await page.getByTestId("theme-toggle").click();
  await expect(html).not.toHaveAttribute("data-theme", first ?? "paper");
  await page.getByTestId("theme-toggle").click();
  await expect(html).toHaveAttribute("data-theme", first ?? "paper");
});

test("adding a superposition term gives two branches with phase rings", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled();
  await loadPreset(page, "E1");
  await page.getByTestId("open-setup").click();
  await expect(page.getByTestId("setup-drawer")).toBeVisible();
  await expect(page.getByTestId("term-row")).toHaveCount(1);
  await page.getByTestId("add-term").click();
  await expect(page.getByTestId("term-row")).toHaveCount(2);
  await page.getByTestId("setup-run").click();
  await expect(page.getByTestId("setup-drawer")).toBeHidden();
  await expect(page.getByTestId("ket-row")).toHaveCount(2);
  await page.getByTestId("mode-gate").click();
  await page.getByTestId("step-forward").click();
  expect(await page.locator(".phase-ring").count()).toBeGreaterThan(0);
});

test("every control has a tooltip and every panel an ⓘ", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled();
  await loadPreset(page, "E2");
  await page.getByTestId("open-setup").click();
  await page.getByTestId("noise-add").click(); // a noise card with all its controls
  await expect(page.getByTestId("noise-card")).toHaveCount(1);
  const missing = await page.$$eval("button, select, input, textarea", (els) =>
    els
      .filter((e) => {
        const el = e as HTMLElement;
        if (el.offsetParent === null) return false; // not rendered
        return !el.title && !el.getAttribute("aria-label") && !el.closest("[title]");
      })
      .map((e) => (e as HTMLElement).outerHTML.slice(0, 120)),
  );
  expect(missing).toEqual([]);
  await page.getByTestId("setup-close").click();
  const panelsWithoutHelp = await page.$$eval(".panel", (els) =>
    els.filter((p) => !p.querySelector(".info-btn[aria-label^='Help']")).map((p) => p.textContent?.slice(0, 60)),
  );
  expect(panelsWithoutHelp).toEqual([]);
  await page.getByTestId("info-ui-canvas").click();
  await expect(page.getByTestId("help-panel")).toContainText("unfolded");
});

test("backup variant E3: step to the end, final ket and backup windows", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E3")).toBeEnabled();
  await loadPreset(page, "E3");
  await expect(page.locator(".gate-band.gate-in").first()).toBeAttached();
  await page.getByTestId("to-end").click();
  const row = page.getByTestId("ket-row").first();
  // b⁽¹⁰⁾ = 10: D₁ kept, D₂ erased; every backup back to red at the port
  expect(compact(await row.textContent())).toContain("|∅out⟩D₂|Rout⟩D̃₁|Rout⟩D₁|Rout⟩Ã₂|∅out⟩A₂|Rout⟩Ã₁|Rout⟩A₁");
  await page.getByTestId("open-setup").click();
  await expect(page.getByTestId("setup-variant")).toHaveValue("backup");
  await expect(page.getByTestId("option-include_last_backup")).not.toBeChecked();
});

async function runPresetFromSetup(page: Page, name: string) {
  await page.getByTestId("open-setup").click();
  await page.getByTestId(`preset-run-${name}`).click();
  await expect(page.getByTestId("setup-drawer")).toBeHidden();
  await expect(page.getByTestId("frame-counter")).toContainText("input");
}

test("noise: a lost D₁ turns into a ghost and the narration says so", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled();
  await runPresetFromSetup(page, "noise-loss");
  await page.getByTestId("tab-Events").click();
  const log = page.getByTestId("event-log");
  await log.getByText(/lost \(blue walker/).first().click();
  await expect(page.getByTestId("narration")).toContainText("lost");
  const row = page.getByTestId("ket-row").first();
  expect(compact(await row.textContent())).toMatch(/\|∅[^⟩]*⟩D₁/);
  await page.getByTestId("to-end").click();
  expect(compact(await page.getByTestId("ket-row").first().textContent())).toContain("|∅out⟩D₁");
});

test("noise: a scatter flip misroutes D₁ and the metrics show the failure", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled();
  await runPresetFromSetup(page, "noise-scatter");
  await page.getByTestId("to-end").click();
  await expect(page.locator("[data-testid=clash]").first()).toBeAttached();
  await page.getByTestId("tab-Metrics").click();
  await expect(page.getByTestId("ensemble-run")).toBeVisible();
  const metrics = page.locator("section").filter({ hasText: "Fidelity" }).first();
  await expect(metrics).toContainText("collided");
});

test("coherent errors: more branches, labelled, with the discarded weight shown", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled();
  await runPresetFromSetup(page, "coherent-demo");
  await page.getByTestId("to-end").click();
  expect(await page.getByTestId("ket-row").count()).toBeGreaterThan(2);
  await expect(page.getByTestId("ket-row").filter({ hasText: "′" }).first()).toBeAttached();
  await page.getByTestId("tab-Metrics").click();
  await expect(page.getByText("Discarded weight").first()).toBeVisible();
});

test("dual-rail: two stacked trees, the data that read 0 come back on the ↑ tree", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-dualrail")).toBeEnabled();
  await loadPreset(page, "dualrail");
  await expect(page.locator('[data-tree="1"]')).toHaveCount(1);
  await page.getByTestId("mode-phase").click();
  const counter = page.getByTestId("frame-counter");
  for (let i = 0; i < 6; i++) await page.getByTestId("step-forward").click();
  await expect(counter).toContainText("tick 25 / 25");
  const rows = page.getByTestId("ket-row");
  await expect(rows).toHaveCount(2);
  // b(00) = 1: D₁ on ↓; b(11) = 0: D₁ on ↑
  expect(compact(await rows.nth(0).textContent())).toContain("|↓Rout⟩D₁");
  expect(compact(await rows.nth(1).textContent())).toContain("|↑Rout⟩D₁");
  await page.getByRole("button", { name: "Resources" }).click();
  await expect(page.getByTestId("variant-comparison")).toContainText("Dual-rail, long range");
});

test("qudit, short range: hollow ○ walkers and the Û_B chain", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-qudit-short")).toBeEnabled();
  await loadPreset(page, "qudit-short");
  await page.getByTestId("mode-tick").click();
  for (let i = 0; i < 4; i++) await page.getByTestId("step-forward").click();
  await expect(page.locator(".canvas .walker.hollow")).toHaveCount(1); // A₂ = ○R
  await expect(page.locator('.canvas .walker[data-state="fB"]').first()).toBeAttached(); // blue ● follower
  await page.getByTestId("open-setup").click();
  await expect(page.getByTestId("setup-variant")).toHaveValue("qudit_short");
  await expect(page.locator(".bit-glyph").first()).toHaveText("●R");
});

test("export: SVG in both themes, PNG, TikZ, JSON and CSV of the current frame", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E2")).toBeEnabled();
  await loadPreset(page, "E2");
  await page.getByTestId("mode-gate").click();
  await page.getByTestId("step-forward").click();
  const htmlTheme = await page.locator("html").getAttribute("data-theme");

  const grab = async (item: string) => {
    await page.getByTestId("export-open").click();
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByTestId(`export-${item}`).click()]);
    const stream = await dl.createReadStream();
    const chunks: Buffer[] = [];
    for await (const c of stream) chunks.push(Buffer.from(c));
    return { name: dl.suggestedFilename(), body: Buffer.concat(chunks) };
  };

  const paper = await grab("svg-paper");
  expect(paper.name).toMatch(/^qram-basic-n2-m1-t\d+-paper\.svg$/);
  const text = paper.body.toString("utf-8");
  expect(text).toContain("<svg");
  expect(text).toContain("#ffffff"); // paper background
  expect(text).not.toMatch(/var\(--|class="|data-testid/); // self-contained
  expect(text).not.toContain("translate(NaN");
  const talk = (await grab("svg-talk")).body.toString("utf-8");
  expect(talk).toContain("#171a21"); // talk background
  await expect(page.locator("html")).toHaveAttribute("data-theme", htmlTheme ?? "paper");

  const png = await grab("png-talk");
  expect(png.body.subarray(1, 4).toString("ascii")).toBe("PNG");
  expect(png.body.length).toBeGreaterThan(5000);
  expect((await grab("tikz")).body.toString("utf-8")).toContain("\\begin{tikzpicture}");
  expect(JSON.parse((await grab("json")).body.toString("utf-8")).schema).toMatch(/^qramsim\.traj/);
  expect((await grab("csv")).body.toString("utf-8").startsWith("t,kind,gate,phase,k,fired_in,text")).toBe(true);
});

test("figure mode and vertical orientation", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E2")).toBeEnabled();
  await loadPreset(page, "E2");
  await expect(page.locator(".canvas .ket-annotation")).toHaveCount(0);
  await page.getByTestId("figure-mode").check();
  await expect(page.locator(".canvas .ket-annotation")).toHaveCount(2);
  await expect(page.locator(".canvas .edge-label").first()).toBeAttached();
  await expect(page.locator(".canvas .port-label").first()).toContainText("ψ_in");
  const box = await page.locator(".canvas .cell").first().boundingBox();
  expect(box!.width).toBeGreaterThan(box!.height); // cells drawn, wide in the horizontal layout
  await page.getByTestId("orientation").selectOption("vertical");
  const tall = await page.locator(".canvas .cell").first().boundingBox();
  expect(tall!.height).toBeGreaterThan(tall!.width);
});

test("compare: the same input on another variant, on one clock", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E2")).toBeEnabled();
  await loadPreset(page, "E2");
  await page.getByTestId("open-compare").click();
  await expect(page.getByTestId("compare-pane")).toBeVisible();
  await expect(page.getByTestId("compare-b")).toBeVisible();
  await expect(page.getByTestId("compare-a")).toContainText("T_total = 23");
  await expect(page.getByTestId("compare-b")).toContainText("F = 1.0000");
  // the clock runs to the longer run; the shorter one has finished by then
  const slider = page.getByTestId("compare-slider");
  const max = Number(await slider.getAttribute("max"));
  await slider.fill(String(max));
  await expect(page.getByTestId("compare-a-state")).toContainText("finished");
  await expect(page.getByTestId("compare-b-state")).toContainText("finished");
  await page.getByTestId("compare-variant").selectOption("dualrail_basic");
  await expect(page.getByTestId("compare-b")).toContainText("dual-rail, basic");
  await expect(page.getByTestId("compare-b").locator("[data-tree='1']")).toHaveCount(1);
  await page.getByTestId("compare-close").click();
  await expect(page.getByTestId("compare-pane")).toHaveCount(0);
});

test("noise on dual-rail: a lost data walker shows at the output", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled();
  await page.getByTestId("open-setup").click();
  await page.getByTestId("preset-load-noise-dualrail").click();
  await expect(page.getByTestId("setup-variant")).toHaveValue("dualrail_basic");
  await expect(page.getByTestId("noise-card")).toHaveCount(1);
  // the models of this family: a logical flip yes, presence dephasing no
  const options = page.getByTestId("noise-add-model").locator("option");
  await expect(options.filter({ hasText: "logical_flip" })).toHaveCount(1);
  await expect(options.filter({ hasText: "presence_dephasing" })).toHaveCount(0);
  await page.getByTestId("setup-run").click();
  await expect(page.getByTestId("setup-drawer")).toBeHidden();
  await page.getByTestId("to-end").click();
  await page.getByTestId("tab-Metrics").click();
  await expect(page.getByTestId("readout-erased").first()).toContainText("no D₁");
  await expect(page.getByTestId("narration")).toBeVisible();
});
