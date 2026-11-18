// The tutorial: a Welcome dialog on the first visit only, eight spotlight steps driven by
// mouse or keyboard, "Got it" plays E1 with guided pauses, and the tour can be taken again
// from the Tutorial button (in both modes) and from the guide.
import { expect, test, type Page } from "@playwright/test";
import { smallText } from "./text";

// a first visit; no sliding card, so its place can be measured at once
test.use({ storageState: { cookies: [], origins: [] }, contextOptions: { reducedMotion: "reduce" } });

const LIT: Record<string, number> = { tree: 1, train: 2, switch: 1, gate: 2, cells: 2, words: 2, controls: 1, more: 5 };

async function ready(page: Page) {
  await expect(page.getByTestId("frame-counter")).toContainText("input");
}

test("the Welcome dialog appears on the first visit only", async ({ page }) => {
  await page.goto("/");
  const welcome = page.getByTestId("welcome");
  await expect(welcome).toBeVisible();
  await expect(page.getByRole("dialog", { name: "Welcome to qram-walkers" })).toBeVisible();
  await expect(page.getByTestId("welcome-start")).toBeFocused();
  expect(await smallText(page)).toEqual([]);
  await page.keyboard.press("Escape"); // Esc is Skip
  await expect(welcome).toBeHidden();
  await page.reload();
  await ready(page);
  await expect(welcome).toHaveCount(0);
  await expect(page.getByTestId("tour")).toHaveCount(0);
});

test("eight steps, each lighting its part; Got it plays E1 and pauses at the end of level 1", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-skip").click();
  await ready(page);
  await page.getByTestId("open-tutorial").click();
  const tour = page.getByTestId("tour");
  const ids = Object.keys(LIT);
  for (const [i, id] of ids.entries()) {
    await expect(tour).toHaveAttribute("data-step", id);
    await expect(page.getByTestId("tour-count")).toHaveText(`${i + 1} / 8`);
    await expect(tour).toHaveAttribute("data-lit", String(LIT[id]));
    expect(await smallText(page), `step ${id}`).toEqual([]);
    // the card covers none of the lit parts
    const card = (await page.locator(".tour-card").boundingBox())!;
    for (const ring of await page.locator(".tour-ring").all()) {
      const r = (await ring.boundingBox())!;
      const apart = card.x >= r.x + r.width || r.x >= card.x + card.width || card.y >= r.y + r.height || r.y >= card.y + card.height;
      expect(apart, `step ${id}`).toBe(true);
    }
    if (i < ids.length - 1) {
      if (i % 2) await page.keyboard.press("ArrowRight");
      else await page.getByTestId("tour-next").click();
    }
  }
  // the tree shows what the text says: the train at the port, Û⁽¹⁾ fired, the query
  await page.keyboard.press("ArrowLeft");
  await expect(tour).toHaveAttribute("data-step", "controls");
  await expect(page.getByTestId("frame-counter")).toContainText("query");
  await page.getByTestId("tour-next").click();
  await page.getByTestId("tour-done").click();
  await expect(tour).toHaveCount(0);
  await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Pause");
  await expect(page.getByTestId("guided")).toBeChecked();
  const note = page.getByTestId("key-moment");
  await expect(note).toHaveAttribute("data-kind", "level", { timeout: 20_000 });
  await expect(page.getByTestId("frame-counter")).toContainText("tick 4 /");
});

test("keyboard: Tab stays in the card, Esc closes the tour, and space does not play", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-start").click();
  const tour = page.getByTestId("tour");
  await expect(tour).toHaveAttribute("data-step", "tree");
  await expect(page.getByTestId("tour-next")).toBeFocused();
  for (let i = 0; i < 5; i++) {
    await page.keyboard.press("Tab");
    expect(await page.evaluate(() => !!document.activeElement?.closest(".tour-card"))).toBe(true);
  }
  await page.getByTestId("tour-next").focus();
  await page.keyboard.press("Enter");
  await expect(tour).toHaveAttribute("data-step", "train");
  await page.keyboard.press(" "); // activates the focused Next, not the playback
  await expect(tour).toHaveAttribute("data-step", "switch");
  await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Play");
  await page.keyboard.press("Escape");
  await expect(tour).toHaveCount(0);
  await expect(page.getByTestId("play")).toHaveAttribute("aria-label", "Play");
});

test("Tutorial starts the tour again, from Advanced mode too, and so does the guide", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("welcome-skip").click();
  await ready(page);
  await page.getByTestId("mode-advanced").click();
  await page.getByTestId("preset-E2").click();
  await page.getByTestId("open-tutorial").click();
  const tour = page.getByTestId("tour");
  await expect(tour).toHaveAttribute("data-step", "tree");
  await expect(page.locator(".app")).toHaveAttribute("data-mode", "simple");
  await page.getByTestId("tour-next").click();
  await expect(tour).toHaveAttribute("data-lit", "2"); // E1 is back: its train at the port
  await expect(page.getByTestId("walker")).toHaveCount(3);
  await page.getByTestId("tour-skip").click();
  await page.getByTestId("open-help").click();
  await page.getByTestId("help-panel").locator('a[href="#start-tutorial"]').first().click();
  await expect(page.getByTestId("help-panel")).toHaveCount(0);
  await expect(tour).toHaveAttribute("data-step", "tree");
});
