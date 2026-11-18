// KaTeX rendering of every formula outside the guide: kets, the mathematics inside sentences,
// the closed formulas of the Resources panel. Only \htmlClass is trusted (walker colours).
import katex from "katex";

const cache = new Map<string, string>();

/** KaTeX HTML of a formula (cached; only \htmlClass is trusted, for the colours). */
export function texHtml(tex: string, display = false): string {
  const key = `${display ? "D" : "I"}${tex}`;
  const hit = cache.get(key);
  if (hit !== undefined) return hit;
  const html = katex.renderToString(tex, {
    displayMode: display,
    throwOnError: false,
    output: "html",
    strict: "ignore",
    trust: (ctx) => ctx.command === "\\htmlClass",
  });
  if (cache.size > 2000) cache.clear();
  cache.set(key, html);
  return html;
}
