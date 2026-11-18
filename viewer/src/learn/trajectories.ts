// The runs of the Learn chapters, precomputed by the engine (scripts/learn-traj.mjs) and
// bundled with the page: each file is loaded the first time a chapter needs it.
import { useEffect, useState } from "react";
import type { Trajectory } from "../model/types";

const FILES = import.meta.glob<Trajectory>("./traj/*.json", { import: "default" });
const cache = new Map<string, Promise<Trajectory>>();

/** Names of the bundled runs. */
export const LEARN_RUNS = Object.keys(FILES).map((p) => p.replace(/^\.\/traj\//, "").replace(/\.json$/, ""));

export function loadLearnTraj(name: string): Promise<Trajectory> {
  let hit = cache.get(name);
  if (!hit) {
    const load = FILES[`./traj/${name}.json`];
    hit = load ? load() : Promise.reject(new Error(`no Learn run named ${name}`));
    cache.set(name, hit);
  }
  return hit;
}

export function useLearnTraj(name: string): Trajectory | null {
  const [traj, setTraj] = useState<{ name: string; traj: Trajectory } | null>(null);
  useEffect(() => {
    let live = true;
    void loadLearnTraj(name).then((t) => {
      if (live) setTraj({ name, traj: t });
    });
    return () => {
      live = false;
    };
  }, [name]);
  return traj && traj.name === name ? traj.traj : null;
}
