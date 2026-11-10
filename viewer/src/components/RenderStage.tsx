// Page used by the headless exports (`qramsim video`, `qramsim figure`; open with ?render):
// the tree, the phase bar, the current sentence and the kets, without controls. The
// script viewer/scripts/render.mjs drives it through window.__qram.
import { useEffect, useMemo } from "react";
import { sceneSvg, svgToPng } from "../export/figure";
import { tikzFrame } from "../export/tikz";
import { sceneBounds } from "../layout/lens";
import { longestStep } from "../layout/unfoldedH";
import { captionAt, videoPosition } from "../export/video";
import { formatAmp } from "../layout/kets";
import { checkTrajectory } from "../model/types";
import { drawFrame } from "../playback/render";
import { usePlayback, type Theme, type ViewOptions } from "../playback/store";
import { Timeline } from "./Controls";
import { Ket } from "./Ket";
import { layoutFor, lensFrameOf, lensShownAt, TreeScene } from "./TreeCanvas";

const MAX_KETS = 4;

function nextPaint(): Promise<void> {
  return new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
}

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("cannot read the image"));
    r.readAsDataURL(blob);
  });
}

function currentScene() {
  const { traj, view, frame, progress } = usePlayback.getState();
  if (!traj) throw new Error("no trajectory loaded");
  const svg = document.querySelector<SVGSVGElement>(".render-canvas svg");
  if (!svg) throw new Error("the scene is not drawn");
  const layout = layoutFor(traj, view);
  // a still frames the lens only when it is shown at this instant
  const lens = lensShownAt(traj, frame, progress, view) ? lensFrameOf(traj, layout, view) : null;
  return { traj, svg, layout, bounds: sceneBounds(layout, lens) };
}

export interface RenderApi {
  load(trajectory: unknown): Promise<number>;
  setView(patch: Partial<ViewOptions>): Promise<void>;
  /** Show video frame i of total; holds are in video frames. */
  seekVideo(i: number, total: number, holdStart: number, holdEnd: number): Promise<void>;
  seek(frame: number): Promise<void>;
  svg(theme: Theme): string;
  png(theme: Theme, scale: number): Promise<string>;
  tikz(): string;
  /** Test support: the longest drawn hop of a walker between two neighbouring sites. */
  geometry(): { step: number; pitch: number };
}

declare global {
  interface Window {
    __qram?: RenderApi;
  }
}

const api: RenderApi = {
  async load(trajectory) {
    usePlayback.getState().load(checkTrajectory(trajectory));
    await nextPaint();
    return usePlayback.getState().traj!.frames.length;
  },
  async setView(patch) {
    usePlayback.getState().setView(patch);
    await nextPaint();
  },
  async seekVideo(i, total, holdStart, holdEnd) {
    const last = usePlayback.getState().traj!.frames.length - 1;
    usePlayback.setState(videoPosition(i, total, last, holdStart, holdEnd));
    await nextPaint();
  },
  async seek(frame) {
    usePlayback.getState().seek(frame);
    await nextPaint();
  },
  svg(theme) {
    const { svg, bounds } = currentScene();
    return sceneSvg(svg, bounds, theme);
  },
  async png(theme, scale) {
    const { svg, bounds } = currentScene();
    return toBase64(await svgToPng(sceneSvg(svg, bounds, theme), bounds.w, bounds.h, scale));
  },
  tikz() {
    const { traj, layout } = currentScene();
    const { frame, view } = usePlayback.getState();
    return tikzFrame(traj, layout, drawFrame(traj, layout, frame, 1, view.ghosts), frame);
  },
  geometry() {
    const { layout } = currentScene();
    return { step: longestStep(layout), pitch: layout.opts.sitePitch };
  },
};

export function RenderStage() {
  const traj = usePlayback((s) => s.traj);
  const frame = usePlayback((s) => s.frame);
  const progress = usePlayback((s) => s.progress);
  const view = usePlayback((s) => s.view);

  useEffect(() => {
    window.__qram = api;
  }, []);
  useEffect(() => {
    document.documentElement.dataset.theme = view.theme;
  }, [view.theme]);

  const layout = useMemo(
    () => (traj ? layoutFor(traj, view) : null),
    // only these options change the layout
    [traj, view.mirror, view.spacing, view.orientation],
  );
  if (!traj || !layout) return <div className="render-stage" data-testid="render-empty" />;
  // the video frames the drawing and, for the whole run, the place of the lens
  const box = sceneBounds(layout, lensFrameOf(traj, layout, view));

  const cur = traj.frames[frame]!;
  const { meta } = traj;
  const kets = cur.branches.slice(0, MAX_KETS);
  const more = cur.branches.length - kets.length;
  return (
    <div className="render-stage" data-testid="render-stage">
      <header className="render-head">
        <strong>Quantum-walker qRAM</strong>
        <span>
          {meta.variant.replace("_", " ")} variant · n = {meta.n}, m = {meta.m}
        </span>
        <span className="spacer" />
        <span className="mono">
          {cur.t < 0 ? "input" : `tick ${cur.t}`} / {meta.phases.T_total - 1}
        </span>
      </header>
      <div className={`canvas render-canvas${view.figure ? " figure" : ""}`}>
        <svg viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`} preserveAspectRatio="xMidYMid meet" width="100%" height="100%">
          <g className="scene-root">
            <TreeScene traj={traj} layout={layout} frame={frame} progress={progress} view={view} highlight={null} lens={{ chosen: null }} />
          </g>
        </svg>
      </div>
      <Timeline />
      <footer className="render-foot">
        <p className="render-caption">{captionAt(traj, frame)}</p>
        <div className="render-kets">
          {kets.map((b) => (
            <div key={b.id} className="render-ket">
              {cur.branches.length > 1 && <span className="mono">{formatAmp(b.amp)}</span>}
              <Ket branch={b} slots={meta.slots} order={view.ketOrder} positions={view.ketPositions} />
            </div>
          ))}
          {more > 0 && <div className="muted">… and {more} more branches</div>}
        </div>
      </footer>
    </div>
  );
}
