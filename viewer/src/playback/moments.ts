// Key moments of a run, for guided playback ("Pause at key moments"), and the sections of
// the narration log. Read off the trajectory's frames: the end of each level's block of
// address-transmission gates (Û, Û_in, Û_B), the start of the query, the start of the
// return trip and the end. No physics.
import { TREE_GATES } from "../layout/gates";
import type { Trajectory } from "../model/types";

export type MomentKind = "level" | "query" | "return" | "exit";

export interface KeyMoment {
  frame: number;
  kind: MomentKind;
  /** Level d for kind "level". */
  level?: number;
  /** Short title ("Level 1 done") and one plain sentence. */
  title: string;
  text: string;
}

/** Last routing frame in which a gate of the address-transmission windows acts on level d. */
function levelBlockEnds(traj: Trajectory): Map<number, number> {
  const ends = new Map<number, number>();
  traj.frames.forEach((f, i) => {
    if (f.phase !== "routing") return;
    for (const e of f.events) {
      if (e.kind === "gate" && TREE_GATES.has(e.type) && e.level >= 1 && e.level <= traj.meta.n) ends.set(e.level, i);
    }
  });
  return ends;
}

/** The key moments of the run, in frame order (one per frame at most). */
export function keyMoments(traj: Trajectory): KeyMoment[] {
  const out = new Map<number, KeyMoment>();
  const n = traj.meta.n;
  for (const [d, frame] of [...levelBlockEnds(traj)].sort((a, b) => a[0] - b[0])) {
    out.set(frame, {
      frame,
      kind: "level",
      level: d,
      title: `Level ${d} done`,
      text:
        d < n
          ? `The gates of level ${d} have acted, controlled by the address walker A${sub(d)}: the walkers behind it now carry the colour that decides which way they turn at the next bifurcation.`
          : `The gates of the last level have acted: the data walkers now follow the address down to its memory cell.`,
    });
  }
  const query = traj.frames.findIndex((f) => f.phase === "query");
  if (query >= 0) {
    out.set(query, {
      frame: query,
      kind: "query",
      title: "Query",
      text: "The train has reached the memory cells: the data walkers now pick up the stored bits.",
    });
  }
  const back = traj.frames.findIndex((f) => f.phase === "inverse");
  if (back >= 0) {
    out.set(back, {
      frame: back,
      kind: "return",
      title: "Return",
      text: "The train turns back and retraces its path exactly (time reversal), so the tree is left as it was found.",
    });
  }
  const last = traj.frames.length - 1;
  if (last > 0) {
    out.set(last, {
      frame: last,
      kind: "exit",
      title: "Done",
      text: "Every walker has left the tree: the output state can be read.",
    });
  }
  return [...out.values()].sort((a, b) => a.frame - b.frame);
}

const SUBS = "₀₁₂₃₄₅₆₇₈₉";
function sub(d: number): string {
  return String(d)
    .split("")
    .map((c) => SUBS[Number(c)]!)
    .join("");
}

/** A section of the narration log: "Level 1", "Query", "Return", starting at `frame`. */
export interface LogSection {
  frame: number;
  title: string;
}

/** Sections of the log: "Level d" from the frame after the end of level d − 1 (level 1 from
 *  the start), "Query" and "Return" from the first frame of those phases. */
export function logSections(traj: Trajectory): LogSection[] {
  const ends = levelBlockEnds(traj);
  const out: LogSection[] = [];
  const firstRouting = traj.frames.findIndex((f) => f.phase === "routing");
  const query = traj.frames.findIndex((f) => f.phase === "query");
  const back = traj.frames.findIndex((f) => f.phase === "inverse");
  const routingEnd = query >= 0 ? query : back >= 0 ? back : traj.frames.length;
  if (firstRouting >= 0) {
    out.push({ frame: firstRouting, title: "Level 1" });
    for (let d = 2; d <= traj.meta.n; d++) {
      const prev = ends.get(d - 1);
      if (prev === undefined || prev + 1 >= routingEnd) continue;
      out.push({ frame: prev + 1, title: `Level ${d}` });
    }
  }
  if (query >= 0) out.push({ frame: query, title: "Query" });
  if (back >= 0) out.push({ frame: back, title: "Return" });
  // pipelined variants: a level can start before the previous one ends
  return out.sort((a, b) => a.frame - b.frame).filter((s, i, all) => i === 0 || s.frame > all[i - 1]!.frame);
}
