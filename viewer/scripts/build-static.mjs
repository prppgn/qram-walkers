// Static site: the viewer with the engine running in the browser (no backend). Builds the
// page with VITE_ENGINE=pyodide into dist-static/ and publishes the engine wheel beside it.
import { execFileSync } from "node:child_process";
import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const viewer = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(viewer, "dist-static");
const run = (cmd, args, cwd, env = {}) =>
  execFileSync(cmd, args, { cwd, stdio: "inherit", env: { ...process.env, ...env }, shell: process.platform === "win32" });

run("pnpm", ["exec", "tsc", "--noEmit"], viewer);
run("pnpm", ["exec", "vite", "build", "--outDir", "dist-static", "--emptyOutDir"], viewer, { VITE_ENGINE: "pyodide" });

const engineDir = join(out, "engine");
mkdirSync(engineDir, { recursive: true });
run("uv", ["build", "--wheel", "--out-dir", engineDir], join(viewer, "..", "engine"));
const wheel = readdirSync(engineDir).find((f) => f.endsWith(".whl"));
if (!wheel) throw new Error("uv build produced no wheel");
writeFileSync(join(engineDir, "wheel.json"), `${JSON.stringify({ wheel })}\n`);
console.log(`static site in ${out} (engine ${wheel})`);
