// Text measured on screen, for the tests of the 13 px floor.
import type { Page } from "@playwright/test";

const MIN_PX = 13;

/** Every visible text smaller than 13 px on screen (SVG text: size × zoom). */
export async function smallText(page: Page): Promise<{ px: number; where: string; text: string }[]> {
  return page.evaluate((min) => {
    const bad: { px: number; where: string; text: string }[] = [];
    const walk = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode(); n; n = walk.nextNode()) {
      if (!/[^\s​]/.test(n.textContent ?? "")) continue;
      const el = n.parentElement;
      if (!el || !el.checkVisibility({ visibilityProperty: true }) || !el.getClientRects().length) continue;
      // KaTeX scripts and fractions are exempt; .katex-mathml is the copy for screen readers,
      // clipped to one pixel and never seen
      if (el.closest(".katex .msupsub, .katex .mfrac, .katex-mathml, title, option")) continue;
      let px = parseFloat(getComputedStyle(el).fontSize);
      if (el instanceof SVGGraphicsElement) {
        const m = el.getScreenCTM();
        if (m) px *= Math.hypot(m.a, m.b);
      }
      if (px < min - 0.05) bad.push({ px: Math.round(px * 10) / 10, where: el.getAttribute("class") ?? el.tagName, text: (n.textContent ?? "").trim().slice(0, 30) });
    }
    return bad;
  }, MIN_PX);
}
