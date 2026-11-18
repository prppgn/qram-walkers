// The animation of a Learn chapter: a run the engine computed, drawn by the same TreeScene as
// the simulator, looping over the frames the chapter is about. It has its own clock and
// never touches the simulator's playback.
import { useEffect, useMemo, useRef, useState } from "react";
import { TreeScene, layoutFor, lensFrameOf } from "../components/TreeCanvas";
import { lodProps, useFitScale } from "../components/useFitScale";
import { Glossed } from "../components/glossary/Glossed";
import { captionAt, instantAt } from "../export/video";
import { sceneBounds } from "../layout/lens";
import { usePlayback, useRegister, type ViewOptions } from "../playback/store";
import type { Clip } from "./chapters";
import { useLearnTraj } from "./trajectories";

/** Clock ticks per second. */
const SPEED = 1.6;
/** Seconds the last frame stays before the clip starts again. */
const HOLD = 1.5;

function prefersReducedMotion(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

const PHASE: Record<string, string> = { init: "input", routing: "routing", query: "query", inverse: "return" };

export function MiniPlayer({ clip, title }: { clip: Clip; title: string }) {
  const traj = useLearnTraj(clip.traj);
  const base = usePlayback((s) => s.view);
  const register = useRegister();
  const view: ViewOptions = useMemo(
    () => ({
      ...base,
      lens: !!clip.lens,
      lensAt: { dx: 0, dy: 0, scale: 1 },
      mirror: true,
      figure: false,
      labels: true,
      ghosts: true,
      traces: false,
      orientation: "horizontal",
      spacing: "proportional",
    }),
    [base, clip.lens],
  );
  const [pos, setPos] = useState(clip.from);
  const [playing, setPlaying] = useState(() => !prefersReducedMotion());
  const at = useRef({ pos: clip.from, hold: 0 });

  const restart = () => {
    at.current = { pos: clip.from, hold: 0 };
    setPos(clip.from);
  };
  useEffect(restart, [clip]);

  useEffect(() => {
    if (!playing || !traj) return;
    let raf = 0;
    let last = performance.now();
    const loop = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const a = at.current;
      if (a.pos >= clip.to) {
        a.hold += dt;
        if (a.hold >= HOLD) {
          a.pos = clip.from;
          a.hold = 0;
        }
      } else {
        a.pos = Math.min(clip.to, a.pos + dt * SPEED);
      }
      setPos(a.pos);
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [playing, traj, clip]);

  const layout = useMemo(
    () => (traj ? layoutFor(traj, view) : null),
    // only these options change the layout
    [traj, view.mirror, view.spacing, view.orientation],
  );
  const bounds = useMemo(
    () => (traj && layout ? sceneBounds(layout, clip.lens ? lensFrameOf(traj, layout, view) : null) : null),
    [traj, layout, view, clip.lens],
  );
  const [svgRef, k] = useFitScale({ w: bounds?.w ?? 1, h: bounds?.h ?? 1 });

  const last = traj ? traj.frames.length - 1 : 0;
  const { frame, progress } = instantAt(pos, last);
  const f = traj?.frames[frame];
  return (
    <figure className="mini" data-testid="learn-player" data-run={clip.traj} data-frame={frame}>
      <div className="canvas mini-canvas">
        {traj && layout && bounds ? (
          <svg
            ref={svgRef}
            viewBox={`${bounds.x} ${bounds.y} ${bounds.w} ${bounds.h}`}
            preserveAspectRatio="xMidYMid meet"
            width="100%"
            height="100%"
            role="img"
            aria-label={`Animation of the chapter “${title}”`}
            {...lodProps(layout, traj.meta, k)}
          >
            <TreeScene
              traj={traj}
              layout={layout}
              frame={frame}
              progress={progress}
              view={view}
              highlight={null}
              lens={clip.lens ? { chosen: null } : undefined}
            />
          </svg>
        ) : (
          <p className="muted">Loading the run…</p>
        )}
      </div>
      <figcaption className="mini-caption" data-testid="learn-caption">
        {traj ? <Glossed text={captionAt(traj, frame, register)} gloss={false} /> : " "}
      </figcaption>
      <div className="mini-controls">
        <button
          className="btn"
          data-testid="learn-play"
          title={playing ? "Pause the animation" : "Play the animation; it loops over the frames of this chapter"}
          onClick={() => setPlaying((p) => !p)}
        >
          {playing ? "❚❚ Pause" : "▶ Play"}
        </button>
        <button className="btn" data-testid="learn-restart" title="Start the animation again from its first frame" onClick={restart}>
          ↺ Restart
        </button>
        <span className="spacer" />
        <span className="muted mono mini-time" title="The phase of the run and the tick of the global clock">
          {f ? `${PHASE[f.phase] ?? f.phase} · ${frame === 0 ? "before tick 0" : `tick ${frame - 1}`}` : ""}
        </span>
      </div>
    </figure>
  );
}
