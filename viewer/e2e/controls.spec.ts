// Every control of the interface explains itself (DECISION D8): on every surface, each
// button, field and menu has a tooltip, and the guide names it. QRAM_DUMP_CONTROLS=<file>
// writes the inventory, one line per control.
import { readFileSync, writeFileSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";

interface Control {
  surface: string;
  tag: string;
  testid: string;
  text: string;
  tip: string;
}

async function inventory(page: Page, surface: string, root = "body"): Promise<Control[]> {
  return page.evaluate(
    ([surf, sel]) => {
      const out: Control[] = [];
      const box = document.querySelector(sel!);
      if (!box) return out;
      for (const el of box.querySelectorAll<HTMLElement>("button, select, input, textarea, a[href], [role='slider']")) {
        const r = el.getBoundingClientRect();
        if (r.width === 0 || r.height === 0) continue;
        const own = el.getAttribute("title") ?? el.querySelector("title")?.textContent ?? "";
        const inherited = (el.closest("[title]") as HTMLElement | null)?.getAttribute("title") ?? "";
        const label = el.closest("label")?.textContent ?? "";
        const options = el.tagName === "SELECT" ? [...el.querySelectorAll("option")].map((o) => o.textContent).join(" / ") : "";
        out.push({
          surface: surf!,
          tag: el.tagName.toLowerCase() + (el.getAttribute("type") ? `:${el.getAttribute("type")}` : ""),
          testid: el.getAttribute("data-testid") ?? "",
          text: (options || el.textContent || label).replace(/\s+/g, " ").trim().slice(0, 70),
          tip: own || inherited || "",
        });
      }
      return out;
    },
    [surface, root],
  );
}

test("every control on every surface has a tooltip", async ({ page }) => {
  test.setTimeout(120_000);
  const all: Control[] = [];
  await page.goto("/");
  await expect(page.getByTestId("preset-E2")).toBeEnabled();
  await page.getByTestId("preset-E2").click();
  await expect(page.getByTestId("frame-counter")).toContainText("input");

  // main view, with each side tab
  all.push(...(await inventory(page, "top bar", ".topbar")));
  all.push(...(await inventory(page, "tree view", ".canvas-tools")));
  all.push(...(await inventory(page, "playback", ".controls")));
  all.push(...(await inventory(page, "narration + state", ".side")));
  for (const tab of ["Phasors", "Metrics", "Resources", "Events", "Legend"]) {
    await page.getByTestId(`tab-${tab}`).click();
    all.push(...(await inventory(page, `tab ${tab}`, ".tab-body")));
  }
  await page.getByTestId("export-open").click();
  all.push(...(await inventory(page, "export menu", "[data-testid='export-items']")));
  await page.getByTestId("export-open").click();

  // setup drawer, with a card of each kind of noise model on each family
  await page.getByTestId("open-setup").click();
  all.push(...(await inventory(page, "setup", "[data-testid='setup-drawer']")));
  for (const model of ["loss", "gate_failure", "clock_jitter", "memory_bit_flip", "overrotation", "beam_splitter_imbalance"]) {
    await page.getByTestId("noise-add-model").selectOption(model);
    await page.getByTestId("noise-add").click();
  }
  all.push(...(await inventory(page, "setup, noise cards", "[data-testid='setup-noise']")));
  await page.getByTestId("setup-variant").selectOption("qudit_short");
  await page.getByTestId("noise-add-model").selectOption("depolarizing");
  await page.getByTestId("noise-add").click();
  all.push(...(await inventory(page, "setup, qudit noise cards", "[data-testid='setup-noise']")));
  await page.getByTestId("setup-close").click();

  // comparison pane
  await page.getByTestId("open-compare").click();
  await expect(page.getByTestId("compare-b")).toBeVisible();
  all.push(...(await inventory(page, "compare", "[data-testid='compare-pane']")));
  await page.getByTestId("compare-close").click();

  // user guide
  await page.getByTestId("open-help").click();
  all.push(...(await inventory(page, "guide", ".help-panel .help-head, .help-panel header")));

  const dump = process.env.QRAM_DUMP_CONTROLS;
  if (dump) {
    writeFileSync(dump, all.map((c) => `${c.surface}\t${c.tag}\t${c.testid}\t${c.text}\t${c.tip}`).join("\n"));
  }
  const silent = all.filter((c) => !c.tip).map((c) => `${c.surface}: ${c.tag} ${c.testid} "${c.text}"`);
  expect(silent).toEqual([]);
  expect(all.length).toBeGreaterThan(100);
});

test("the Controls page of the guide names every labelled control", async ({ page }) => {
  const guide = readFileSync(new URL("../../docs/user-guide/controls.md", import.meta.url), "utf-8").toLowerCase();
  // Text of the labelled controls in a part of the page. Values that change (kets, numbers) are out.
  const collect = (root: string) =>
    page.evaluate((sel) => {
      const out = new Set<string>();
      const box = document.querySelector(sel);
      if (!box) return [];
      const add = (t: string | null) => {
        const clean = (t ?? "").replace(/\s+/g, " ").trim();
        if (clean) out.add(clean);
      };
      for (const el of box.querySelectorAll("button, label")) {
        if (el.closest(".ket-row, [data-testid='ket-row'], [data-testid='phasor'], [data-testid='memory-cell'], .setup-preset-head")) continue;
        if (el.tagName === "LABEL" && el.querySelector("select")) continue;
        add(el.textContent);
      }
      for (const o of box.querySelectorAll("option")) add(o.textContent);
      for (const b of box.querySelectorAll(".setup-preset-head .badge")) add(b.textContent);
      return [...out];
    }, root);
  const dynamic = /^(\|.*|[01]+|ⓘ|[+−✕⏮◀▶⏸⏭▾▸].*|Add a.*|speed.*|tick .*|with.*|.*\d\/s)$/;
  const named = (label: string) => {
    // The name of the control: what comes before a bracket, a formula or a symbol.
    const words = label.replace(/^[^\p{L}]+/u, "").toLowerCase();
    const plain: string[] = [];
    for (const word of words.split(" ")) {
      if (!/^[a-z0-9.,_-]+$/.test(word)) break;
      plain.push(word);
    }
    return guide.includes(plain.join(" ") || words);
  };

  await page.goto("/");
  await expect(page.getByTestId("preset-E2")).toBeEnabled();
  await page.getByTestId("preset-E2").click();
  await expect(page.getByTestId("frame-counter")).toContainText("input");
  await page.getByTestId("export-open").click();
  const labels: string[] = [];
  for (const sel of [".topbar", ".canvas-tools", ".controls", ".side"]) labels.push(...(await collect(sel)));
  await page.getByTestId("export-open").click();
  await page.getByTestId("tab-Events").click();
  labels.push(...(await collect(".tab-body")));
  await page.getByTestId("open-setup").click();
  for (const model of ["loss", "overrotation", "beam_splitter_imbalance"]) {
    await page.getByTestId("noise-add-model").selectOption(model);
    await page.getByTestId("noise-add").click();
  }
  labels.push(...(await collect("[data-testid='setup-drawer']")));
  await page.getByTestId("setup-variant").selectOption("qudit_short");
  await page.getByTestId("noise-add-model").selectOption("depolarizing");
  await page.getByTestId("noise-add").click();
  labels.push(...(await collect("[data-testid='setup-noise']")));
  await page.getByTestId("setup-variant").selectOption("backup");
  labels.push(...(await collect("[data-testid='setup-drawer']")));
  await page.getByTestId("setup-close").click();
  await page.getByTestId("open-compare").click();
  await expect(page.getByTestId("compare-b")).toBeVisible();
  labels.push(...(await collect("[data-testid='compare-pane']")));

  const missing = [...new Set(labels)].filter((l) => !dynamic.test(l) && !named(l));
  expect(missing).toEqual([]);
  expect(labels.length).toBeGreaterThan(50);
});

test("the guide opens on Start, and its links lead to the right places", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("preset-E1")).toBeEnabled();
  await page.getByTestId("open-help").click();
  const help = page.getByTestId("help-panel");
  await expect(help.locator("h1")).toHaveText("Getting started");
  await help.locator('a[href="controls.md#controls-memory"]').click(); // another page, at an anchor
  await expect(help.locator("h1")).toHaveText("Every control");
  await expect(help.locator('[id="controls-memory"]')).toBeInViewport();
  await help.locator('a[href="#controls-setup"]').first().click(); // same page
  await expect(help.locator('[id="controls-setup"]')).toBeInViewport();
  await help.getByRole("button", { name: "Command line" }).click();
  await expect(help.locator("h1")).toHaveText("Command line");
});
