// The steps of the tutorial, written for the example E1 (n = 2, one stored bit, the address
// a = 10, the bit 1 in cell 10). Each step lights some parts of the page (CSS selectors; all
// the matches of one selector make one lit area) and shows a frame of the run. The text
// says what the engine does; it adds no physics of its own.
import type { Trajectory } from "../../model/types";

export interface TourStep {
  id: string;
  title: string;
  /** Plain sentences; symbols such as A₁, Û^(d), |R⟩ are typeset by KaTeX. */
  text: string;
  /** One lit area per selector (the union of its matches); missing ones are skipped. */
  targets: string[];
  /** Keep the card off this part of the page when there is room elsewhere. */
  avoid?: string;
  /** The frame the tree shows during this step. */
  frame(traj: Trajectory): number;
}

/** First routing frame in which Û^(level) acted. */
function firstU(traj: Trajectory, level: number): number {
  const i = traj.frames.findIndex(
    (f) => f.phase === "routing" && f.events.some((e) => e.kind === "gate" && e.type === "U" && e.level === level && e.fired_in.length > 0),
  );
  return Math.max(0, i);
}

function firstOf(traj: Trajectory, phase: string): number {
  return Math.max(0, traj.frames.findIndex((f) => f.phase === phase));
}

const TREE = "[data-testid='tree-canvas']";
const start = () => 0;
const query = (traj: Trajectory) => firstOf(traj, "query");

export const TOUR_STEPS: TourStep[] = [
  {
    id: "tree",
    title: "A memory read by walkers",
    text:
      "This quantum RAM has four memory cells, the leaves of a binary tree with two levels; the square in each cell is the bit it stores (filled: 1). " +
      "Particles called walkers enter at the input port on the left, go down the tree to a cell and come back. " +
      "The right half is the same tree drawn again for the way back, which ends at the output port.",
    targets: [TREE],
    frame: start,
  },
  {
    id: "train",
    title: "The train and its colours",
    text:
      "The walkers travel as a train, one site per tick of a global clock. Each walker is a two-level system, red |R⟩ or blue |B⟩, and a slot of the train can also be empty, |∅⟩ (a dashed circle). " +
      "The address a = 10 is written by presence: A₁ is red because a₁ = 1, A₂ is empty because a₂ = 0. " +
      "Behind them come the flag D₀ and the data walker D₁, both red.",
    targets: ["[data-tour='train']", "[data-tour='input-port']"],
    avoid: TREE,
    frame: start,
  },
  {
    id: "switch",
    title: "Colour decides the turn: Ŝ",
    text:
      "At every bifurcation the scattering gate Ŝ sends a red walker into the left branch (bit 0, drawn above) and a blue walker into the right branch (bit 1, drawn below), and turns it red again. " +
      "It needs no control and no clock: it acts on every walker that crosses. " +
      "A₁, red, has just crossed the first bifurcation into the left branch.",
    targets: ["[data-tour='switch']"],
    avoid: TREE,
    frame: (traj) => firstU(traj, 1),
  },
  {
    id: "gate",
    title: "The address walker instructs the others: Û",
    text:
      "The green bands are the windows of the gate Û^(d), which the clock fires on every edge of level d at once. " +
      "If the address walker A_d is red (bit 1), Û^(d) flips the colour of every walker behind it; if A_d is absent (bit 0), nothing happens. " +
      "Û^(1) has just fired: A₁ was red, so D₀ and D₁ are now blue and Ŝ will send them into the right branch. " +
      "A₂ is absent, so at level 2 they stay red and take the left branch, into cell 10.",
    targets: ["[data-tour='gate-window']", "[data-tour='gate-label']"],
    avoid: TREE,
    frame: (traj) => firstU(traj, 1),
  },
  {
    id: "cells",
    title: "Reading a memory cell",
    text:
      "After the last level the flag D₀ and the data walker D₁ rest in cell 10; the address walker A₁, its job done, rests in cell 00. " +
      "Nothing moves during the query: a copy gate acts only where D₀ is, and leaves D₁ red if the stored bit is 1 or removes it (|∅⟩) if it is 0. " +
      "The lens shows the inside of the cell. Then every walker retraces its path exactly backwards and leaves by the output port.",
    targets: ["[data-tour='cells']", "[data-tour='lens']"],
    avoid: TREE,
    frame: query,
  },
  {
    id: "words",
    title: "What is happening, in words",
    text:
      "The line under the tree says what is happening now. " +
      "The narration on the right keeps one sentence for every event, under the headers Level 1, Level 2, Query and Return. " +
      "Click a line to go back to that moment; Explain opens the guide where that step is defined.",
    targets: ["[data-testid='caption'], [data-testid='key-moment']", "[data-testid='narration']"],
    frame: query,
  },
  {
    id: "controls",
    title: "Playing the run",
    text:
      "▶ plays and pauses (Space); ◀ and ▶︎| go one gate back or forward (← and →); speed sets the clock ticks per second. " +
      "With Pause at key moments the run stops at the end of each level, at the query, on the way back and at the end: Space continues. " +
      "The coloured bar is the timeline: click it to jump.",
    targets: ["[data-testid='controls']"],
    frame: query,
  },
  {
    id: "more",
    title: "Your own runs",
    text:
      "Examples has ready-made runs, each described in one line: in E2 the address is a superposition of two addresses, and the train splits to read both cells at once. " +
      "Setup chooses the variant, the amplitudes of the addresses, the memory and the noise. " +
      "Details shows the quantum state, the fidelity and the resources; Guide explains everything, and Tutorial shows this tour again.",
    targets: [
      "[data-testid='examples']",
      "[data-testid='open-setup']",
      "[data-testid='open-details']",
      "[data-testid='open-help']",
      "[data-testid='open-tutorial']",
    ],
    frame: query,
  },
];
