// Export of the drawn scene (DESIGN.md §7.6): a self-contained SVG in either theme, a PNG
// rasterised from it, and small download helpers. The SVG is a clone of the live drawing
// with the theme's computed styles written on each element, so it does not depend on the
// page's stylesheets. It frames the drawing and, when it is open, the cell lens; the
// lens's buttons (marked data-export="skip") are left out. Nothing is computed here but pixels.
import type { Rect } from "../layout/lens";
import type { Theme } from "../playback/store";

const COMMON = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-width",
  "stroke-opacity",
  "stroke-dasharray",
  "stroke-linecap",
  "stroke-linejoin",
  "opacity",
  "paint-order",
] as const;
const TEXT = ["font-family", "font-size", "font-weight", "font-style"] as const;
// Initial values: leaving them out keeps the file small.
const DEFAULTS: Record<string, string> = {
  "fill-opacity": "1",
  "stroke-opacity": "1",
  "stroke-dasharray": "none",
  "stroke-linecap": "butt",
  "stroke-linejoin": "miter",
  opacity: "1",
  "paint-order": "normal",
  "font-style": "normal",
  stroke: "none",
};

function inlineStyles(src: Element, dst: Element, skipped: Element[]): void {
  if (src.getAttribute("data-export") === "skip") {
    skipped.push(dst);
    return;
  }
  const cs = getComputedStyle(src);
  const isText = src.tagName === "text" || src.tagName === "tspan";
  const parts: string[] = [];
  for (const prop of [...COMMON, ...(isText ? TEXT : [])]) {
    const value = cs.getPropertyValue(prop);
    if (value && value !== DEFAULTS[prop]) parts.push(`${prop}:${value}`);
  }
  if (parts.length) dst.setAttribute("style", parts.join(";"));
  else dst.removeAttribute("style");
  dst.removeAttribute("class");
  for (const name of [...dst.getAttributeNames()]) {
    if (name.startsWith("data-")) dst.removeAttribute(name);
  }
  const from = src.children;
  const to = dst.children;
  for (let i = 0; i < from.length; i++) inlineStyles(from[i]!, to[i]!, skipped);
}

/** `fn` with the page in `theme`: styles are recomputed on demand, no repaint happens. */
function withTheme<T>(theme: Theme, fn: () => T): T {
  const root = document.documentElement;
  const saved = root.dataset.theme;
  root.dataset.theme = theme;
  try {
    return fn();
  } finally {
    if (saved === undefined) delete root.dataset.theme;
    else root.dataset.theme = saved;
  }
}

/** Standalone SVG of the live drawing `svg` (its `.scene-root` group) in `theme`, framing
 *  `box` (drawing coordinates: the drawing, and the lens when it is open). */
export function sceneSvg(svg: SVGSVGElement, box: Rect, theme: Theme): string {
  return withTheme(theme, () => {
    const scene = svg.querySelector(".scene-root");
    if (!scene) throw new Error("no scene to export");
    const copy = scene.cloneNode(true) as Element;
    const skipped: Element[] = [];
    inlineStyles(scene, copy, skipped);
    for (const el of skipped) el.remove();
    copy.removeAttribute("transform");
    for (const t of [...copy.querySelectorAll("title")]) t.remove();
    const out = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    const x = Math.floor(box.x);
    const y = Math.floor(box.y);
    const w = Math.ceil(box.x + box.w) - x;
    const h = Math.ceil(box.y + box.h) - y;
    out.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    out.setAttribute("viewBox", `${x} ${y} ${w} ${h}`);
    out.setAttribute("width", String(w));
    out.setAttribute("height", String(h));
    const bg = document.createElementNS("http://www.w3.org/2000/svg", "rect");
    bg.setAttribute("x", String(x));
    bg.setAttribute("y", String(y));
    bg.setAttribute("width", String(w));
    bg.setAttribute("height", String(h));
    bg.setAttribute("fill", getComputedStyle(document.documentElement).getPropertyValue("--surface").trim());
    out.append(bg, copy);
    return `<?xml version="1.0" encoding="UTF-8"?>\n${new XMLSerializer().serializeToString(out)}\n`;
  });
}

/** Rasterise an SVG string at `scale` times its size. */
export async function svgToPng(svgText: string, width: number, height: number, scale = 3): Promise<Blob> {
  const img = new Image();
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
  try {
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("the SVG could not be rasterised"));
      img.src = url;
    });
    const canvas = document.createElement("canvas");
    canvas.width = Math.ceil(width * scale);
    canvas.height = Math.ceil(height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("no 2D canvas available");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("PNG encoding failed"))), "image/png");
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

/** The save door of the desktop app's window (`qramsim.desktop.DesktopApi`), if the page runs there. */
interface DesktopApi {
  save_file(name: string, base64: string): Promise<string | null>;
}

function desktopApi(): DesktopApi | undefined {
  const api = (window as { pywebview?: { api?: Partial<DesktopApi> } }).pywebview?.api;
  return api?.save_file ? (api as DesktopApi) : undefined;
}

export async function toBase64(blob: Blob): Promise<string> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(binary);
}

/** Save a file: the browser's download, or a save dialog in the desktop app's window. */
export async function download(name: string, data: Blob | string, type = "text/plain"): Promise<void> {
  const blob = typeof data === "string" ? new Blob([data], { type }) : data;
  const desktop = typeof window === "undefined" ? undefined : desktopApi();
  if (desktop) {
    await desktop.save_file(name, await toBase64(blob));
    return;
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
