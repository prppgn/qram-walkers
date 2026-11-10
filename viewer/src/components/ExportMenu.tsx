// Export menu of the tree view (DESIGN.md §7.6): the current frame as SVG or PNG in either
// theme, as TikZ, and the trajectory as JSON or its events as CSV.
import { useState, type RefObject } from "react";
import { download, sceneSvg, svgToPng } from "../export/figure";
import { eventsCsv } from "../export/tables";
import { tikzFrame } from "../export/tikz";
import type { Rect } from "../layout/lens";
import type { Layout } from "../layout/unfoldedH";
import { drawFrame } from "../playback/render";
import { usePlayback, type Theme } from "../playback/store";
import { InfoButton } from "./Panel";

/** `bounds`: what the images frame (the drawing, and the cell lens when it is open). */
export function ExportMenu({ svg, layout, bounds }: { svg: RefObject<SVGSVGElement>; layout: Layout; bounds: Rect }) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const stem = () => {
    const { traj, frame } = usePlayback.getState();
    const t = traj!.frames[frame]!.t;
    const m = traj!.meta;
    return `qram-${m.variant}-n${m.n}-m${m.m}-${t < 0 ? "input" : `t${t}`}`;
  };

  const act = (fn: () => void | Promise<void>) => async () => {
    setError(null);
    try {
      await fn();
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const asSvg = (theme: Theme) =>
    act(() => download(`${stem()}-${theme}.svg`, sceneSvg(svg.current!, bounds, theme), "image/svg+xml"));
  const asPng = (theme: Theme) =>
    act(async () => {
      const text = sceneSvg(svg.current!, bounds, theme);
      await download(`${stem()}-${theme}.png`, await svgToPng(text, bounds.w, bounds.h));
    });
  const asTikz = act(() => {
    const { traj, frame, view } = usePlayback.getState();
    const branches = drawFrame(traj!, layout, frame, 1, view.ghosts);
    return download(`${stem()}.tex`, tikzFrame(traj!, layout, branches, frame), "application/x-tex");
  });
  const asJson = act(() => {
    const { traj } = usePlayback.getState();
    const m = traj!.meta;
    return download(`qram-${m.variant}-n${m.n}-m${m.m}.traj.json`, JSON.stringify(traj), "application/json");
  });
  const asCsv = act(() => {
    const { traj } = usePlayback.getState();
    const m = traj!.meta;
    return download(`qram-${m.variant}-n${m.n}-m${m.m}-events.csv`, eventsCsv(traj!), "text/csv");
  });

  const items: { id: string; label: string; tip: string; run: () => Promise<void> }[] = [
    { id: "svg-paper", label: "SVG, paper theme", tip: "This frame as a vector image, light theme", run: asSvg("paper") },
    { id: "svg-talk", label: "SVG, talk theme", tip: "This frame as a vector image, dark theme", run: asSvg("talk") },
    { id: "png-paper", label: "PNG, paper theme", tip: "This frame as a bitmap at three times the drawing size, light theme", run: asPng("paper") },
    { id: "png-talk", label: "PNG, talk theme", tip: "This frame as a bitmap at three times the drawing size, dark theme", run: asPng("talk") },
    { id: "tikz", label: "TikZ (.tex)", tip: "This frame as a standalone LaTeX file you can edit", run: asTikz },
    { id: "json", label: "Trajectory (.json)", tip: "The whole run: reload it with qramsim, or keep it as a record", run: asJson },
    { id: "csv", label: "Events (.csv)", tip: "Every event of the run: tick, phase, kind, gate and sentence", run: asCsv },
  ];

  return (
    <div className="export-menu">
      <button
        className="btn"
        title="Export this frame as an image or as TikZ, or the whole run as data"
        data-testid="export-open"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        Export
      </button>
      {open && (
        <div className="export-items" role="menu" data-testid="export-items">
          {items.map((it) => (
            <button key={it.id} role="menuitem" className="btn" title={it.tip} data-testid={`export-${it.id}`} onClick={() => void it.run()}>
              {it.label}
            </button>
          ))}
          {error && (
            <p className="export-error" role="alert">
              {error}
            </p>
          )}
          <InfoButton anchor="ui-export" topic="the exports" />
        </div>
      )}
    </div>
  );
}
