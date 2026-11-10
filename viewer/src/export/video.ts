// Pure helpers of the headless renderer (`qramsim video`): which instant of the trajectory
// a video frame shows, and which sentence it carries. Data only, no physics.
import type { EventJSON, Trajectory } from "../model/types";

export interface VideoPosition {
  frame: number;
  progress: number;
}

/** The instant at clock position `p` (in frames, 0 = input state, `last` = output): frame
 *  `f` with progress in (0, 1] is on the way from frame f − 1 to frame f. */
export function instantAt(p: number, last: number): VideoPosition {
  const q = Math.min(last, p);
  if (q <= 0) return { frame: 0, progress: 1 };
  const frame = Math.ceil(q - 1e-9);
  return { frame, progress: Math.min(1, q - (frame - 1)) };
}

/**
 * Instant shown by video frame `i` of `total`: the first and last frames of the
 * trajectory are held for `holdStart` and `holdEnd` video frames, the ticks in between
 * take equal time. `last` is the index of the last trajectory frame.
 */
export function videoPosition(i: number, total: number, last: number, holdStart: number, holdEnd: number): VideoPosition {
  const moving = Math.max(1, total - holdStart - holdEnd - 1);
  return instantAt((Math.max(0, i - holdStart) / moving) * last, last);
}

function firstSentence(text: string): string {
  const stop = text.search(/[.:;] /);
  return stop > 0 ? text.slice(0, stop + 1) : text;
}

function rank(e: EventJSON): number {
  if (e.kind === "noise" || e.kind === "stray" || e.kind === "collision" || e.kind === "absorb") return 0;
  if (e.kind === "gate" && e.fired_in.length > 0) return 1;
  if (e.kind === "scatter") return 2;
  if (e.kind === "phase" || e.kind === "turn") return 3;
  if (e.kind === "inject" || e.kind === "exit") return 4;
  return 9;
}

/** The sentence to show at trajectory frame `frame`: the most telling event of the most
 *  recent frame that has one. */
export function captionAt(traj: Trajectory, frame: number): string {
  for (let f = Math.min(frame, traj.frames.length - 1); f >= 0; f--) {
    const events = traj.frames[f]!.events.filter((e) => rank(e) < 9);
    if (events.length === 0) continue;
    const best = events.reduce((a, b) => (rank(b) < rank(a) ? b : a));
    return best.kind === "phase" ? firstSentence(best.text) : best.text;
  }
  return "Input state: the train waits on the port line, front slot first.";
}
