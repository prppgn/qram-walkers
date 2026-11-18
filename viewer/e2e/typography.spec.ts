// Typography: the fonts come from the app itself (no font server, so the static site works
// offline), and no text is drawn under 13 px, tree labels included, through a whole run.
// KaTeX sub- and superscripts are exempt: they are 0.7 of their formula, as in print.
import { expect, test } from "@playwright/test";
import { smallText } from "./text";

test("the fonts are served by the app, not by a font server", async ({ page }) => {
  const foreign: string[] = [];
  page.on("request", (r) => {
    const host = new URL(r.url()).hostname;
    if (host !== "127.0.0.1" && host !== "localhost") foreign.push(r.url());
  });
  await page.goto("/");
  await expect(page.getByTestId("frame-counter")).toContainText("input");
  await page.evaluate(() => document.fonts.ready);
  const loaded = await page.evaluate(() => [...document.fonts].filter((f) => f.status === "loaded").map((f) => f.family.replace(/"/g, "")));
  expect(loaded).toContain("IBM Plex Sans");
  expect(loaded).toContain("IBM Plex Mono");
  expect(loaded.some((f) => f.startsWith("KaTeX"))).toBe(true);
  expect(foreign).toEqual([]);
});

for (const preset of ["E1", "E2"]) {
  test(`${preset}: no text under 13 px through the whole run, in every panel`, async ({ page }) => {
    await page.goto("/");
    await expect(page.getByTestId("frame-counter")).toContainText("input");
    await page.getByRole("button", { name: preset, exact: true }).click();
    await expect(page.getByTestId("frame-counter")).toContainText("input");
    expect(await smallText(page)).toEqual([]);
    const counter = page.getByTestId("frame-counter");
    for (let i = 0; i < 60; i++) {
      const before = await counter.textContent();
      await page.keyboard.press("ArrowRight");
      if ((await counter.textContent()) === before) break;
      expect(await smallText(page), `at ${await counter.textContent()}`).toEqual([]);
    }
    for (const tab of ["Phasors", "Metrics", "Resources", "Events", "Legend"]) {
      await page.getByRole("button", { name: tab, exact: true }).click();
      expect(await smallText(page), `in ${tab}`).toEqual([]);
    }
    // figure mode: kets beside the train, with their sub- and superscripts
    await page.getByTestId("figure-mode").check();
    await page.getByTitle(/Jump to the start of the query/).click();
    await expect(page.locator(".canvas .ket-annotation").first()).toBeVisible();
    expect(await smallText(page), "in figure mode").toEqual([]);
  });
}

test("the compare view keeps its text at 13 px or more", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("frame-counter")).toContainText("input");
  await page.getByRole("button", { name: "Compare", exact: true }).click();
  await expect(page.getByTestId("compare-b-state")).toBeVisible();
  expect(await smallText(page)).toEqual([]);
});
