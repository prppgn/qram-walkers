// Global viewer state (zustand): the loaded trajectory, playback position, view
// options and the setup being edited. Physics never happens here.
import { create } from "zustand";
import { engine } from "../engine/client";
import type { PresetJSON, RunConfigJSON, Trajectory } from "../model/types";
import { keyMoments, type KeyMoment } from "./moments";
import { nextStop, prevStop, type StepMode } from "./steps";

export type Theme = "paper" | "talk";
/** Simple: the tree, a caption, the narration log and few controls; Advanced: every panel. */
export type Mode = "simple" | "advanced";
/** Tabs of the Details drawer (Simple mode). */
export type DetailsTab = "State" | "Metrics" | "Resources" | "Events" | "Phasors" | "Legend" | "Train";

/** Default playback speed of each mode, in ticks per second. */
export const MODE_SPEED: Record<Mode, number> = { simple: 1, advanced: 2 };

export interface ViewOptions {
  theme: Theme;
  labels: boolean;
  ghosts: boolean;
  mirror: boolean;
  spacing: "proportional" | "uniform";
  ketOrder: "paper" | "train";
  ketPositions: boolean;
  opacity: "prob" | "amp";
  includeIdleGates: boolean;
  traces: boolean;
  /** Paper figure mode: (d,l) labels, kets near the train, no flashes. */
  figure: boolean;
  orientation: "horizontal" | "vertical";
  /** The cell lens: a box showing the inside of the cell the train has reached. */
  lens: boolean;
  /** Where the lens is, as a shift from its default place, and its size (1 = the tree's scale). */
  lensAt: { dx: number; dy: number; scale: number };
}

export interface PlaybackState {
  mode: Mode;
  traj: Trajectory | null;
  /** Key moments of the loaded run (guided playback). */
  moments: KeyMoment[];
  /** Pause at key moments while playing. */
  guided: boolean;
  /** The key moment playback stopped at, until it is resumed or the position changes. */
  pausedAt: KeyMoment | null;
  detailsOpen: boolean;
  detailsTab: DetailsTab;
  /** Name of the preset last run, or null for a run from the setup. */
  preset: string | null;
  /** Target frame; with progress < 1 the view is on the way from frame − 1. */
  frame: number;
  progress: number;
  playing: boolean;
  /** Ticks per second. */
  speed: number;
  stepMode: StepMode;
  view: ViewOptions;
  highlight: number | null;
  presets: PresetJSON[];
  config: RunConfigJSON | null;
  busy: boolean;
  error: string | null;
  /** Progress of a slow engine start (static site), null when ready. */
  engineStatus: string | null;
  helpOpen: boolean;
  helpAnchor: string | null;
  setupOpen: boolean;
  compareOpen: boolean;
  /** The lens was closed with its × (until a cell is clicked or the toggle is set again). */
  lensClosed: boolean;
  /** Cell chosen with a tab of the lens or by clicking it on the tree. */
  lensCell: number | null;

  setMode(mode: Mode): void;
  setGuided(on: boolean): void;
  setDetails(open: boolean, tab?: DetailsTab): void;
  load(traj: Trajectory): void;
  run(config: RunConfigJSON): Promise<void>;
  /** Run the preset `name` (when the engine offers it). */
  runPreset(name: string): Promise<void>;
  loadPresets(): Promise<void>;
  setConfig(config: RunConfigJSON): void;
  seek(frame: number): void;
  step(delta: 1 | -1): void;
  jumpPhase(phase: string): void;
  togglePlay(): void;
  tick(dt: number): void;
  setSpeed(speed: number): void;
  setStepMode(mode: StepMode): void;
  setView(patch: Partial<ViewOptions>): void;
  setHighlight(id: number | null): void;
  openHelp(anchor?: string | null): void;
  closeHelp(): void;
  setSetupOpen(open: boolean): void;
  setCompareOpen(open: boolean): void;
  setLensClosed(closed: boolean): void;
  /** Show cell l in the lens (and open the lens). */
  setLensCell(l: number | null): void;
}

function initialMode(): Mode {
  try {
    const saved = localStorage.getItem("qram-mode");
    if (saved === "simple" || saved === "advanced") return saved;
  } catch {
    /* storage unavailable */
  }
  return "simple";
}
const MODE = initialMode();

function initialTheme(): Theme {
  try {
    const saved = localStorage.getItem("qram-theme");
    if (saved === "paper" || saved === "talk") return saved;
  } catch {
    /* storage unavailable */
  }
  return "paper";
}

export const usePlayback = create<PlaybackState>((set, get) => ({
  mode: MODE,
  traj: null,
  moments: [],
  guided: MODE === "simple",
  pausedAt: null,
  detailsOpen: false,
  detailsTab: "State",
  preset: null,
  frame: 0,
  progress: 1,
  playing: false,
  speed: MODE_SPEED[MODE],
  stepMode: "gate",
  view: {
    theme: initialTheme(),
    labels: true,
    ghosts: true,
    mirror: true,
    spacing: "proportional",
    ketOrder: "paper",
    ketPositions: true,
    opacity: "prob",
    includeIdleGates: false,
    traces: false,
    figure: false,
    orientation: "horizontal",
    lens: true,
    lensAt: { dx: 0, dy: 0, scale: 1 },
  },
  highlight: null,
  presets: [],
  config: null,
  busy: false,
  error: null,
  engineStatus: null,
  helpOpen: false,
  helpAnchor: null,
  setupOpen: false,
  compareOpen: false,
  lensClosed: false,
  lensCell: null,

  setMode(mode) {
    try {
      localStorage.setItem("qram-mode", mode);
    } catch {
      /* storage unavailable */
    }
    set({ mode, speed: MODE_SPEED[mode], guided: mode === "simple", detailsOpen: false, pausedAt: null, ...(mode === "simple" ? { stepMode: "gate" as StepMode } : {}) });
  },
  setGuided(on) {
    set({ guided: on, pausedAt: on ? get().pausedAt : null });
  },
  setDetails(open, tab) {
    set({ detailsOpen: open, ...(tab ? { detailsTab: tab } : {}) });
  },

  load(traj) {
    set({
      traj,
      moments: keyMoments(traj),
      pausedAt: null,
      frame: 0,
      progress: 1,
      playing: false,
      highlight: null,
      error: null,
      config: traj.config,
      lensClosed: false,
      lensCell: null,
    });
  },

  async run(config) {
    set({ busy: true, error: null, config, preset: null });
    try {
      const traj = await engine.simulate(config);
      get().load(traj);
    } catch (e) {
      set({ error: e instanceof Error ? e.message : String(e) });
    } finally {
      set({ busy: false });
    }
  },

  async runPreset(name) {
    const p = get().presets.find((x) => x.name === name);
    if (!p) return;
    await get().run(p.config);
    if (!get().error) set({ preset: name });
  },

  async loadPresets() {
    try {
      set({ presets: await engine.presets() });
    } catch (e) {
      set({ error: `cannot reach the engine (${e instanceof Error ? e.message : String(e)}); ${engine.failureHint}` });
    }
  },

  setConfig(config) {
    set({ config });
  },

  seek(frame) {
    const traj = get().traj;
    if (!traj) return;
    const f = Math.max(0, Math.min(traj.frames.length - 1, Math.round(frame)));
    set({ frame: f, progress: 1, pausedAt: null });
  },

  step(delta) {
    const { traj, frame, stepMode, view } = get();
    if (!traj) return;
    const opts = { includeIdle: view.includeIdleGates };
    const target = delta > 0 ? nextStop(traj, frame, stepMode, opts) : prevStop(traj, frame, stepMode, opts);
    set({ frame: target, progress: 1, playing: false, pausedAt: null });
  },

  jumpPhase(phase) {
    const traj = get().traj;
    if (!traj) return;
    const i = traj.frames.findIndex((f) => f.phase === phase);
    if (i >= 0) set({ frame: i, progress: 1, playing: false, pausedAt: null });
  },

  togglePlay() {
    const { traj, playing, frame } = get();
    if (!traj) return;
    if (!playing && frame >= traj.frames.length - 1) set({ frame: 0, progress: 1 });
    set({ playing: !playing, pausedAt: null });
  },

  tick(dt) {
    const { traj, playing, speed } = get();
    if (!traj || !playing) return;
    let { frame, progress } = get();
    if (progress >= 1) {
      if (frame >= traj.frames.length - 1) {
        set({ playing: false });
        return;
      }
      frame += 1;
      progress = 0;
    }
    progress = Math.min(1, progress + dt * speed);
    // guided playback: stop when a key moment is reached
    const { guided, moments } = get();
    const moment = guided && progress >= 1 ? moments.find((m) => m.frame === frame) : undefined;
    if (moment) set({ frame, progress, playing: false, pausedAt: moment });
    else set({ frame, progress });
  },

  setSpeed(speed) {
    set({ speed });
  },
  setStepMode(mode) {
    set({ stepMode: mode });
  },
  setView(patch) {
    const view = { ...get().view, ...patch };
    if (patch.theme) {
      try {
        localStorage.setItem("qram-theme", patch.theme);
      } catch {
        /* storage unavailable */
      }
    }
    set({ view });
  },
  setHighlight(id) {
    set({ highlight: id });
  },
  openHelp(anchor = null) {
    set({ helpOpen: true, helpAnchor: anchor });
  },
  closeHelp() {
    set({ helpOpen: false });
  },
  setSetupOpen(open) {
    set({ setupOpen: open });
  },
  setCompareOpen(open) {
    set({ compareOpen: open, playing: false });
  },
  setLensClosed(closed) {
    set({ lensClosed: closed });
  },
  setLensCell(l) {
    set({ lensCell: l, lensClosed: false });
  },
}));

engine.onStatus?.((status) => usePlayback.setState({ engineStatus: status }));
