// The tutorial: a Welcome dialog on the first visit, then a guided tour of the interface in
// a few spotlight steps on the example E1. State only; the steps are in steps.ts and the
// drawing in Tour.tsx. The tour drives playback through the playback store (seek, play);
// it never touches the physics.
import { create } from "zustand";
import { usePlayback } from "../../playback/store";
import { TOUR_STEPS } from "./steps";

const SEEN_KEY = "qram-tour";
/** The example the tour is written for. */
export const TOUR_PRESET = "E1";

function firstVisit(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === null;
  } catch {
    return false; // no storage: never insist
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "seen");
  } catch {
    /* storage unavailable */
  }
}

export interface TourState {
  /** The Welcome dialog is open (first visit only). */
  welcome: boolean;
  /** Index of the current step, or null when the tour is closed. */
  step: number | null;
  /** Open the tour at its first step: Simple mode, E1, everything else closed. */
  start(): void;
  go(step: number): void;
  next(): void;
  back(): void;
  /** Close the tour; with `play`, E1 starts from the beginning in guided playback. */
  finish(play: boolean): void;
  /** Close the Welcome dialog without the tour. */
  dismissWelcome(): void;
}

export const useTour = create<TourState>((set, get) => ({
  welcome: firstVisit(),
  step: null,

  start() {
    markSeen();
    const p = usePlayback.getState();
    if (p.mode !== "simple") p.setMode("simple");
    p.setView({ lens: true, mirror: true, figure: false, labels: true, ghosts: true, orientation: "horizontal" });
    usePlayback.setState({
      playing: false,
      pausedAt: null,
      setupOpen: false,
      detailsOpen: false,
      helpOpen: false,
      compareOpen: false,
      lensClosed: false,
      lensCell: null,
      highlight: null,
    });
    const s = usePlayback.getState();
    if (s.preset !== TOUR_PRESET && !(s.busy && !s.traj)) void s.runPreset(TOUR_PRESET);
    set({ welcome: false, step: 0 });
  },

  go(step) {
    set({ step: Math.max(0, Math.min(TOUR_STEPS.length - 1, step)) });
  },
  next() {
    const { step } = get();
    if (step === null) return;
    if (step >= TOUR_STEPS.length - 1) get().finish(true);
    else set({ step: step + 1 });
  },
  back() {
    const { step } = get();
    if (step !== null && step > 0) set({ step: step - 1 });
  },

  finish(play) {
    set({ step: null });
    const p = usePlayback.getState();
    if (!p.traj) return;
    p.seek(0);
    if (play) {
      p.setGuided(true);
      if (!usePlayback.getState().playing) p.togglePlay();
    }
  },

  dismissWelcome() {
    markSeen();
    set({ welcome: false });
  },
}));
