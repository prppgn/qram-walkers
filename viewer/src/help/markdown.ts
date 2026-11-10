// Minimal Markdown + KaTeX renderer for the user guide (docs/user-guide/*.md).
// Headings may carry an explicit anchor: "## Title {#anchor}" → <h2 id="anchor">.
import katex from "katex";
import { marked } from "marked";

const MACROS = {
  "\\ket": "\\left|#1\\right\\rangle",
  "\\bra": "\\left\\langle#1\\right|",
};

export interface RenderedPage {
  html: string;
  anchors: string[];
  title: string;
}

function renderMath(expr: string, display: boolean): string {
  return katex.renderToString(expr, { displayMode: display, throwOnError: false, macros: { ...MACROS } });
}

export function renderMarkdown(source: string): RenderedPage {
  const math: string[] = [];
  const stash = (expr: string, display: boolean): string => {
    math.push(renderMath(expr.trim(), display));
    return `@@MATH${math.length - 1}@@`;
  };
  // Protect code spans / blocks from math extraction.
  const code: string[] = [];
  let text = source.replace(/```[\s\S]*?```|`[^`\n]+`/g, (m) => {
    code.push(m);
    return `@@CODE${code.length - 1}@@`;
  });
  text = text.replace(/\$\$([\s\S]+?)\$\$/g, (_, e: string) => stash(e, true));
  text = text.replace(/(^|[^\\$])\$([^$\n]+?)\$/g, (_, pre: string, e: string) => pre + stash(e, false));
  text = text.replace(/@@CODE(\d+)@@/g, (_, i: string) => code[Number(i)]!);

  const anchors: string[] = [];
  let title = "";
  // [ \t] (not \s): in multiline mode \s would swallow the blank line after the heading
  // and marked would fold the next paragraph into the raw <h2> block.
  text = text.replace(/^(#{1,6})[ \t]+(.*?)[ \t]*(?:\{#([\w-]+)\})?[ \t]*$/gm, (_, hashes: string, body: string, id?: string) => {
    const depth = hashes.length;
    if (!title && depth === 1) title = body.replace(/@@MATH\d+@@/g, "").trim();
    const inner = marked.parseInline(body) as string;
    if (id) anchors.push(id);
    return `<h${depth}${id ? ` id="${id}"` : ""}>${inner}</h${depth}>`;
  });
  let html = marked.parse(text, { async: false }) as string;
  html = html.replace(/@@MATH(\d+)@@/g, (_, i: string) => math[Number(i)]!);
  return { html, anchors, title };
}
