// The user guide is the single source for the Help panel (DESIGN.md §8): the Markdown
// pages of docs/user-guide are bundled at build time.
import { renderMarkdown, type RenderedPage } from "./markdown";

const raw = import.meta.glob("../../../docs/user-guide/*.md", {
  query: "?raw",
  import: "default",
  eager: true,
}) as Record<string, string>;

export const PAGE_ORDER = ["start", "protocol", "variants", "gates", "metrics", "noise", "ui", "controls", "cli", "faq"] as const;
const PAGE_TITLES: Record<string, string> = {
  start: "Start",
  protocol: "Protocol",
  variants: "Variants",
  gates: "Gates",
  metrics: "Metrics",
  noise: "Noise",
  ui: "Interface",
  controls: "Controls",
  cli: "Command line",
  faq: "FAQ",
};

export interface GuidePage extends RenderedPage {
  id: string;
  tab: string;
}

function pageId(path: string): string {
  return path.split("/").pop()!.replace(/\.md$/, "");
}

export const GUIDE: GuidePage[] = Object.entries(raw)
  .map(([path, src]) => ({ id: pageId(path), src }))
  .sort((a, b) => {
    const ia = PAGE_ORDER.indexOf(a.id as (typeof PAGE_ORDER)[number]);
    const ib = PAGE_ORDER.indexOf(b.id as (typeof PAGE_ORDER)[number]);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  })
  .map(({ id, src }) => ({ id, tab: PAGE_TITLES[id] ?? id, ...renderMarkdown(src) }));

/** Page that defines an anchor, if any. */
export function pageOfAnchor(anchor: string): GuidePage | undefined {
  return GUIDE.find((p) => p.anchors.includes(anchor));
}
