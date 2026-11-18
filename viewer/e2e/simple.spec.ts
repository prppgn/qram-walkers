// Simple mode, as a first-time visitor sees it: the default on the first visit, a narration
// log that only grows, guided playback that stops at the key moments, the Details drawer,
// the View menu and the layout of narrow windows.
import { expect, test, type Page } from "@playwright/test";

test.use({ storageState: { cookies: [], origins: [] } });

async function openE1(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("frame-counter")).toContainText("input");
}

test("Simple is the default on the first visit, and the choice is remembered", async ({ page }) => {
  await openE1(page);
  await expect(page.locator(".app")).toHaveAttribute("data-mode", "simple");
  await expect(page.getByTestId("mode-simple")).toHaveAttribute("aria-pressed", "true");
  // the train strip and the side tabs are not in the way
  await expect(page.getByTestId("train-strip")).toHaveCount(0);
  await expect(page.getByTestId("tab-Metrics")).toHaveCount(0);
  await expect(page.getByTestId("caption")).toContainText("train");
  await page.getByTestId("mode-advanced").click();
  await expect(page.locator(".app")).toHaveAttribute("data-mode", "advanced");
  await expect(page.getByTestId("train-strip")).toBeVisible();
  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-mode", "advanced");
  await page.getByTestId("mode-simple").click();
  await page.reload();
  await expect(page.locator(".app")).toHaveAttribute("data-mode", "simple");
});

test("the narration log only grows: after five gate steps it has five lines or more, none lost", async ({ page }) => {
  await openE1(page);
  await page.getByTestId("examples").click();
  await page.getByTestId("preset-E2").click();
  await expect(page.getByTestId("frame-counter")).toContainText("input");
  const counter = page.getByTestId("frame-counter");
  const lines = page.getByTestId("log-line");
  let before: string[] = await lines.allTextContents();
  expect(before).toEqual([]);
  for (let i = 0; i < 5; i++) {
    const tick = await counter.textContent();
    await page.getByTestId("step-forward").click();
    await expect(counter).not.toHaveText(tick ?? "");
    await expect(lines).not.toHaveCount(before.length);
    const now = await lines.allTextContents();
    expect(now.slice(0, before.length)).toEqual(before);
    before = now;
  }
  expect(before.length).toBeGreaterThanOrEqual(5);
  await expect(page.getByTestId("log-section").first()).toHaveText("Level 1");
  // the newest line is in view
  await expect(lines.last()).toBeInViewport();
  // a line takes you back to its tick
  const first = lines.first();
  const frame = await first.getAttribute("data-frame");
  await first.click();
  await expect(first).toHaveClass(/current/);
  expect(Number(frame)).toBeGreaterThan(0);
});

test("guided playback pauses at the end of level 1 of E1; space continues", async ({ page }) => {
  await openE1(page);
  await expect(page.getByTestId("guided")).toBeChecked();
  await page.getByTestId("speed").fill("2"); // 4 ticks per second
  await page.getByTestId("play").click();
  const note = page.getByTestId("key-moment");
  await expect(note).toBeVisible({ timeout: 15_000 });
  await expect(note).toHaveAttribute("data-kind", "level");
  await expect(note).toContainText("Level 1 done");
  await expect(page.getByTestId("frame-counter")).toContainText("tick 4 /");
  await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Play");
  await page.keyboard.press(" ");
  await expect(note).toBeHidden();
  // the next stop is the end of level 2, then a click on the note continues
  await expect(note).toContainText("Level 2 done", { timeout: 15_000 });
  await note.click();
  await expect(note).toContainText("Query", { timeout: 15_000 });
});

test("Details shows the other panels one at a time, the train among them", async ({ page }) => {
  await openE1(page);
  await page.getByTestId("open-details").click();
  const drawer = page.getByTestId("details-drawer");
  await expect(drawer.getByTestId("ket-row").first()).toBeVisible();
  for (const [tab, inside] of [
    ["Metrics", "metric-fidelity"],
    ["Resources", "resources"],
    ["Legend", "legend-panel"],
    ["Train", "train-strip"],
  ] as const) {
    await drawer.getByTestId(`details-${tab}`).click();
    await expect(drawer.getByTestId(inside)).toBeVisible();
  }
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
});

test("the View menu holds the drawing options", async ({ page }) => {
  await openE1(page);
  await page.getByTestId("view").click();
  await page.getByTestId("figure-mode").check();
  await expect(page.locator(".canvas.figure")).toBeVisible();
  await page.getByTestId("orientation").selectOption("vertical");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("view-menu")).toBeHidden();
  await expect(page.locator(".canvas.figure")).toBeVisible();
});

test("the Examples menu describes each example in one line and loads it", async ({ page }) => {
  await openE1(page);
  await page.getByTestId("examples").click();
  await expect(page.getByTestId("preset-E1")).toContainText("E1 — one address, one stored bit");
  await page.getByTestId("preset-E2").click();
  await expect(page.getByTestId("examples-menu")).toBeHidden();
  await expect(page.getByTestId("frame-counter")).toContainText("input");
  await page.getByTestId("open-details").click();
  await expect(page.getByTestId("ket-row")).toHaveCount(2);
});

test("under 1100 px the panels go below the tree, which keeps 60% of the height", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await openE1(page);
  const canvas = await page.getByTestId("tree-canvas").boundingBox();
  const log = await page.getByTestId("narration").boundingBox();
  expect(canvas!.height).toBeGreaterThanOrEqual(0.6 * 800 - 1);
  expect(log!.y).toBeGreaterThan(canvas!.y + canvas!.height);
  for (const mode of ["advanced", "simple"]) {
    await page.getByTestId(`mode-${mode}`).click();
    const c = await page.getByTestId("tree-canvas").boundingBox();
    const n = await page.getByTestId("narration").boundingBox();
    expect(c!.height).toBeGreaterThanOrEqual(0.6 * 800 - 1);
    expect(n!.y).toBeGreaterThan(c!.y + c!.height);
  }
});
