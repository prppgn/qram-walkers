// Learn works offline: its animations are runs the engine computed beforehand, bundled with
// the static site, so they need neither a backend nor Python in the browser.
import { expect, test } from "@playwright/test";

test("Learn runs its animations with no network beyond the page itself", async ({ page, baseURL }) => {
  const origin = new URL(baseURL ?? "http://127.0.0.1:4173").origin;
  const blocked: string[] = [];
  await page.route(
    (url) => url.origin !== origin,
    (route) => {
      blocked.push(route.request().url());
      return route.abort();
    },
  );
  await page.goto("/#learn");
  await expect(page.getByTestId("learn-chapter")).toHaveAttribute("data-chapter", "why");
  for (const id of ["why", "read", "noise", "next"]) {
    await page.getByTestId(`learn-nav-${id}`).click();
    const player = page.getByTestId("learn-player");
    await expect(player.locator("svg[role='img']")).toBeVisible();
    const first = await player.getAttribute("data-frame");
    await expect(player).not.toHaveAttribute("data-frame", first ?? "", { timeout: 5_000 });
  }
  await page.getByTestId("learn-nav-glossary").click();
  expect(await page.locator("[data-term-entry]").count()).toBeGreaterThanOrEqual(20);
  // Try it needs no engine either: the run is the bundled one
  await page.getByTestId("learn-nav-walkers").click();
  await page.getByTestId("learn-try").click();
  await expect(page.getByTestId("learn")).toBeHidden();
  await expect(page.getByTestId("frame-counter")).not.toContainText("input");
});
