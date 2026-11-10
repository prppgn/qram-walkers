// The run compared with the current one: same input and same memory on another variant.
// Pure: the viewer asks the engine for it like for any other run.
import type { NoiseEntryJSON, RunConfigJSON, Trajectory } from "../model/types";
import { copyModesFor, variantInfo, VARIANTS } from "./setup/configModel";

/** Natural partner of a variant in the comparison. */
const PARTNER: Record<string, string> = {
  basic: "backup",
  backup: "basic",
  qudit_short: "qudit_long",
  qudit_long: "qudit_short",
  dualrail_basic: "dualrail_backup",
  dualrail_backup: "dualrail_basic",
};

export function defaultPartner(variant: string): string {
  return PARTNER[variant] ?? VARIANTS.find((v) => v.id !== variant)!.id;
}

/** The noise of a run on another variant: presence dephasing becomes the logical dephasing it
 *  is on walkers that are always present, and what the other family lacks is dropped (D35). */
function noiseOn(noise: NoiseEntryJSON[], variant: string): NoiseEntryJSON[] {
  const family = variantInfo(variant)?.family ?? "bosonic";
  const out: NoiseEntryJSON[] = [];
  for (const entry of noise) {
    const e = { ...entry };
    if (e.model === "presence_dephasing" && family !== "bosonic") e.model = "logical_dephasing";
    if (e.model === "logical_flip" && family === "bosonic") continue;
    if (family === "bosonic") delete e.on;
    else delete e.vacuum_phase;
    out.push(e);
  }
  return out;
}

/** Configuration of `traj` moved to `variant`: its input and memory are already explicit
 *  in a resolved run. Site overrides are dropped. */
export function comparisonConfig(traj: Trajectory, variant: string): RunConfigJSON {
  const cfg = traj.config;
  const modes = copyModesFor(variant);
  const options = { ...cfg.options };
  delete options.n_sites;
  return {
    ...cfg,
    variant,
    copy_mode: modes.includes(cfg.copy_mode) ? cfg.copy_mode : modes[0]!,
    options,
    noise: noiseOn(cfg.noise ?? [], variant),
  };
}

/** Whether a noise channel of the current run does not exist on `variant`. */
export function noiseDropped(traj: Trajectory, variant: string): boolean {
  const noise = traj.config.noise ?? [];
  return noiseOn(noise, variant).length < noise.length;
}
