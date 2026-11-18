// The runs the Learn chapters animate, computed by the engine and stored (minified) in
// src/learn/traj/, so that Learn works without the engine, offline too. Run it after any
// engine change that alters trajectories or narration:  node scripts/learn-traj.mjs
// Every run has n ≤ 2, so the files stay small.
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const viewer = join(dirname(fileURLToPath(import.meta.url)), "..");
const engine = join(viewer, "..", "engine");
const out = join(viewer, "src", "learn", "traj");

/** File name → arguments of `qramsim run`. */
const RUNS = {
  E1: ["--preset", "E1"],
  E1b: ["--preset", "E1b"],
  E2: ["--preset", "E2"],
  "uniform-n2": ["--variant", "basic", "--n", "2", "--m", "1", "--input", "uniform", "--memory", "1,0,1,1"],
  "noise-loss": ["--preset", "noise-loss"],
  E3: ["--preset", "E3"],
  dualrail: ["--preset", "dualrail"],
};

mkdirSync(out, { recursive: true });
const tmp = mkdtempSync(join(tmpdir(), "learn-traj-"));
try {
  for (const [name, args] of Object.entries(RUNS)) {
    const file = join(tmp, `${name}.json`);
    execFileSync("uv", ["run", "qramsim", "run", ...args, "--out", file, "--quiet"], {
      cwd: engine,
      stdio: "inherit",
      shell: process.platform === "win32",
    });
    const traj = JSON.parse(readFileSync(file, "utf8"));
    if (traj.meta.n > 2) throw new Error(`${name}: n = ${traj.meta.n}, Learn keeps n ≤ 2`);
    writeFileSync(join(out, `${name}.json`), `${JSON.stringify(traj)}\n`);
    console.log(`${name}: ${traj.frames.length} frames`);
  }
} finally {
  rmSync(tmp, { recursive: true, force: true });
}
