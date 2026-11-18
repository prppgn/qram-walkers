// Learn (ten chapters with animations of runs the engine computed), the glossary popovers and
// the plain/technical wording of the sentences, as a first-time visitor in Simple mode meets them.
import { expect, test, type Page } from "@playwright/test";
import { SEEN } from "./storage";
import { smallText } from "./text";

test.use({ storageState: SEEN });

const CHAPTERS = ["why", "walkers", "turn", "instruct", "read", "return", "superposition", "noise", "variants", "next"];

async function openE1(page: Page) {
  await page.goto("/");
  await expect(page.getByTestId("frame-counter")).toContainText("input");
}

test("Learn has ten chapters, each with a running animation, its formulas and Try it", async ({ page }) => {
  await openE1(page);
  await page.getByTestId("open-learn").click();
  await expect(page).toHaveURL(/#learn$/);
  const learn = page.getByTestId("learn");
  await expect(learn).toBeVisible();
  await expect(learn.locator("[data-testid^='learn-nav-']")).toHaveCount(11); // ten chapters and the glossary
  for (const [i, id] of CHAPTERS.entries()) {
    const chapter = page.getByTestId("learn-chapter");
    await expect(chapter).toHaveAttribute("data-chapter", id);
    await expect(page.getByTestId(`learn-nav-${id}`)).toHaveAttribute("aria-current", "page");
    const player = page.getByTestId("learn-player");
    await expect(player.locator("svg[role='img']")).toBeVisible();
    // the animation runs: its frame changes by itself
    const first = await player.getAttribute("data-frame");
    await expect(player).not.toHaveAttribute("data-frame", first ?? "", { timeout: 5_000 });
    await expect(page.getByTestId("learn-caption")).not.toBeEmpty();
    // the formulas are folded, and typeset when opened
    const formulas = page.getByTestId("learn-formulas");
    await expect(formulas.locator(".katex-display").first()).toBeHidden();
    await formulas.locator("summary").click();
    await expect(formulas.locator(".katex-display").first()).toBeVisible();
    await expect(formulas.locator(".katex-error")).toHaveCount(0);
    await expect(page.getByTestId("learn-try")).toBeVisible();
    await expect(page.getByTestId("learn-prev")).toHaveCount(i === 0 ? 0 : 1);
    // no text under 13 px, the drawing included (KaTeX scripts excepted, as everywhere)
    expect(await smallText(page), id).toEqual([]);
    await page.getByTestId("learn-next").click();
  }
  // after the last chapter, the glossary
  await expect(page).toHaveURL(/#learn\/glossary$/);
  expect(await page.locator("[data-term-entry]").count()).toBeGreaterThanOrEqual(20);
});

test("Try it loads the chapter's run into the simulator and plays it", async ({ page }) => {
  await page.goto("/#learn/read");
  await expect(page.getByTestId("learn-chapter")).toHaveAttribute("data-chapter", "read");
  await page.getByTestId("learn-try").click();
  await expect(page.getByTestId("learn")).toBeHidden();
  await expect(page).not.toHaveURL(/#learn/);
  // E1b: the address 10, the bit 0 in its cell; playback started
  await expect(page.getByTestId("play")).toHaveText("⏸");
  await expect(page.getByTestId("frame-counter")).not.toContainText("input");
  await expect(page.getByTestId("log-line").first()).toBeVisible();
});

test("a chapter has its own link; Esc closes Learn and Back reopens it", async ({ page }) => {
  await page.goto("/#learn/noise");
  await expect(page.getByTestId("learn-chapter")).toHaveAttribute("data-chapter", "noise");
  await expect(page.getByTestId("learn-player")).toHaveAttribute("data-run", "noise-loss");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("learn")).toBeHidden();
  await expect(page.getByTestId("frame-counter")).toBeVisible();
  await page.goBack();
  await expect(page.getByTestId("learn-chapter")).toHaveAttribute("data-chapter", "noise");
  await page.getByTestId("learn-close").click();
  await expect(page.getByTestId("learn")).toBeHidden();
});

test("underlined terms explain at least twenty words of the protocol, and lead to the guide", async ({ page }) => {
  await page.goto("/#learn");
  const popover = page.getByTestId("term-popover");
  const shown = new Set<string>();
  for (const id of CHAPTERS) {
    await page.getByTestId(`learn-nav-${id}`).click();
    await expect(page.getByTestId("learn-chapter")).toHaveAttribute("data-chapter", id);
    const terms = page.locator(".learn-text [data-term]");
    const n = await terms.count();
    for (let i = 0; i < n; i++) {
      const term = terms.nth(i);
      const want = await term.getAttribute("data-term");
      await term.focus();
      await expect(popover).toHaveAttribute("data-shows", want ?? "");
      await expect(popover).not.toBeEmpty();
      shown.add(want ?? "");
    }
  }
  expect(shown.size).toBeGreaterThanOrEqual(20);
  // a click on a term opens the guide where it is defined, above Learn
  await page.getByTestId("learn-nav-turn").click();
  await page.locator(".learn-text [data-term='S']").first().click();
  const help = page.getByTestId("help-panel");
  await expect(help).toBeVisible();
  await expect(help.locator('[id="gate-S"]')).toBeInViewport();
  // the simulator's caption marks terms too
  await page.goto("/");
  await expect(page.getByTestId("frame-counter")).toContainText("input");
  await page.getByTestId("caption").locator("[data-term]").first().hover();
  await expect(popover).toBeVisible();
});

async function logLines(page: Page): Promise<string[]> {
  return page.getByTestId("log-line").locator(".pn-event-text").evaluateAll((els) => els.map((e) => e.getAttribute("data-plain") ?? ""));
}

test("the wording follows the mode and can be forced; it changes every narration line", async ({ page }) => {
  await openE1(page);
  await page.keyboard.press("End");
  await expect(page.getByTestId("frame-counter")).toContainText("tick 22");
  const plain = await logLines(page);
  expect(plain.length).toBeGreaterThan(10);
  // Simple mode speaks plainly by default; force the technical wording in the View menu
  await page.getByTestId("view").click();
  await page.getByTestId("wording").selectOption("technical");
  await page.keyboard.press("Escape");
  const technical = await logLines(page);
  expect(technical).toHaveLength(plain.length);
  for (const [i, line] of technical.entries()) expect(line, `line ${i}`).not.toBe(plain[i]);
  expect(technical.join(" ")).toContain("Û⁽¹⁾");
  // the caption follows
  await expect(page.getByTestId("caption")).toHaveText(/./);
  // back to "follow the mode": plain in Simple, technical in Advanced
  await page.getByTestId("view").click();
  await page.getByTestId("wording").selectOption("auto");
  await page.keyboard.press("Escape");
  expect(await logLines(page)).toEqual(plain);
  await page.getByTestId("mode-advanced").click();
  expect(await page.getByTestId("narration").locator(".pn-event-text").first().getAttribute("data-plain")).toBeTruthy();
});
