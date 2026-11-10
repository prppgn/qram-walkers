// Step navigation over the frames of a trajectory (DECISION D6): by tick, by gate
// event, by level (the leading walker crosses a bifurcation, engine-provided marks) and
// by phase. Frame i is the state at the end of tick i − 1 (frame 0 = input).
import type { Trajectory } from "../model/types";

export type StepMode = "tick" | "gate" | "level" | "phase";

export interface StepOptions {
  /** In "gate" mode also stop at gate instances whose control was absent everywhere. */
  includeIdle: boolean;
}

function hasGate(traj: Trajectory, i: number, includeIdle: boolean): boolean {
  return traj.frames[i]!.events.some(
    (e) => e.kind === "gate" && (includeIdle || e.fired_in.length > 0),
  );
}

function phaseStart(traj: Trajectory, i: number): boolean {
  return i > 0 && traj.frames[i]!.phase !== traj.frames[i - 1]!.phase;
}

/** Frame indices that are stops for a step mode (always includes first and last). */
export function stops(traj: Trajectory, mode: StepMode, opts: StepOptions): number[] {
  const last = traj.frames.length - 1;
  const out = new Set<number>([0, last]);
  if (mode === "tick") {
    for (let i = 0; i <= last; i++) out.add(i);
  } else if (mode === "gate") {
    for (let i = 1; i <= last; i++) if (hasGate(traj, i, opts.includeIdle)) out.add(i);
  } else if (mode === "level") {
    for (const m of traj.meta.marks?.level ?? []) out.add(Math.min(last, m.t + 1));
    for (let i = 1; i <= last; i++) if (phaseStart(traj, i)) out.add(i);
  } else {
    for (let i = 1; i <= last; i++) if (phaseStart(traj, i)) out.add(i);
  }
  return [...out].sort((a, b) => a - b);
}

export function nextStop(traj: Trajectory, i: number, mode: StepMode, opts: StepOptions): number {
  for (const s of stops(traj, mode, opts)) if (s > i) return s;
  return traj.frames.length - 1;
}

export function prevStop(traj: Trajectory, i: number, mode: StepMode, opts: StepOptions): number {
  const all = stops(traj, mode, opts);
  for (let j = all.length - 1; j >= 0; j--) if (all[j]! < i) return all[j]!;
  return 0;
}

/** First frame of each phase, for the phase-jump buttons and the timeline bands. */
export function phaseBands(traj: Trajectory): { phase: string; start: number; end: number }[] {
  const bands: { phase: string; start: number; end: number }[] = [];
  traj.frames.forEach((f, i) => {
    const lastBand = bands[bands.length - 1];
    if (lastBand && lastBand.phase === f.phase) lastBand.end = i;
    else bands.push({ phase: f.phase, start: i, end: i });
  });
  return bands;
}
