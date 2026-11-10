// Phase 5 acceptance: the static site runs E1–E4 without a backend, with the
// engine in the browser; the answers are those of the Python engine (Eq. 1 exactly).
import { expect, test } from "@playwright/test";

test("E1–E4 and a new variant run in the browser, with no request to a backend", async ({ page }) => {
  const backend: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api")) backend.push(r.url());
  });
  await page.goto("/");
  // the page boots on E1 by itself once Python is up
  await expect(page.getByTestId("ket-row").first()).toBeVisible({ timeout: 240_000 });
  for (const name of ["E1", "E2", "E3", "E4", "dualrail"]) {
    await page.getByTestId(`preset-${name}`).click();
    await expect(page.getByTestId("frame-counter")).toContainText("input", { timeout: 60_000 });
    await page.getByTestId("to-end").click();
    await page.getByTestId("tab-Metrics").click();
    // The tooltip carries the full precision: Eq. (1) must hold exactly, as in Python.
    for (const metric of ["fidelity", "success"]) {
      const title = await page.getByTestId(`metric-${metric}`).locator(".pn-metric-value").getAttribute("title");
      const value = Number(/Full precision: ([\d.e+-]+)/.exec(title ?? "")?.[1]);
      expect(Math.abs(value - 1), `${name} ${metric}`).toBeLessThan(1e-12);
    }
  }
  expect(backend).toEqual([]);
});

test("a noisy ensemble runs in the worker", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled({ timeout: 240_000 });
  await page.getByTestId("open-setup").click();
  await page.getByTestId("preset-run-noise-demo").click();
  await expect(page.getByTestId("setup-drawer")).toBeHidden({ timeout: 60_000 });
  await page.getByTestId("tab-Metrics").click();
  await page.getByTestId("ensemble-runs").fill("8");
  await page.getByTestId("ensemble-run").click();
  await expect(page.getByTestId("ensemble-result")).toBeVisible({ timeout: 120_000 });
  await expect(page.getByTestId("ensemble-fidelity")).toBeVisible();
});

test("noise on a new variant runs in the worker too", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled({ timeout: 240_000 });
  await page.getByTestId("open-setup").click();
  await page.getByTestId("preset-run-noise-dualrail").click();
  await expect(page.getByTestId("setup-drawer")).toBeHidden({ timeout: 60_000 });
  await page.getByTestId("to-end").click();
  await page.getByTestId("tab-Metrics").click();
  await expect(page.getByTestId("readout-erased").first()).toContainText("no D₁");
});
