// EngineClient: the only door to the physics. HttpEngine talks to `qramsim serve`
// (proxied at /api in development); the static build (VITE_ENGINE=pyodide) runs the same
// engine in the browser, in a Web Worker (pyodide.ts).
import {
  checkTrajectory,
  type EnsembleJSON,
  type PresetJSON,
  type RunConfigJSON,
  type Trajectory,
} from "../model/types";

export interface EngineClient {
  simulate(config: RunConfigJSON): Promise<Trajectory>;
  presets(): Promise<PresetJSON[]>;
  health(): Promise<{ status: string; version: string }>;
  /** Mean, standard deviation and standard error of the metrics over `runs` noisy runs. */
  ensemble(config: RunConfigJSON, runs: number, seed0?: number): Promise<EnsembleJSON>;
  /** What to tell the user when the engine does not answer. */
  readonly failureHint: string;
  /** Progress of a slow start, null when ready. */
  onStatus?(listener: (status: string | null) => void): void;
}

async function readError(resp: Response): Promise<string> {
  try {
    const body = (await resp.json()) as { detail?: unknown };
    return typeof body.detail === "string" ? body.detail : JSON.stringify(body.detail);
  } catch {
    return `${resp.status} ${resp.statusText}`;
  }
}

export class HttpEngine implements EngineClient {
  failureHint = "start it with `uv run qramsim serve`";

  constructor(private readonly base = "/api") {}

  async simulate(config: RunConfigJSON): Promise<Trajectory> {
    const resp = await fetch(`${this.base}/simulate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(config),
    });
    if (!resp.ok) throw new Error(await readError(resp));
    return checkTrajectory(await resp.json());
  }

  async presets(): Promise<PresetJSON[]> {
    const resp = await fetch(`${this.base}/presets`);
    if (!resp.ok) throw new Error(await readError(resp));
    return (await resp.json()) as PresetJSON[];
  }

  async ensemble(config: RunConfigJSON, runs: number, seed0 = 0): Promise<EnsembleJSON> {
    const resp = await fetch(`${this.base}/ensemble`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ config, runs, seed0 }),
    });
    if (!resp.ok) throw new Error(await readError(resp));
    return (await resp.json()) as EnsembleJSON;
  }

  async health(): Promise<{ status: string; version: string }> {
    const resp = await fetch(`${this.base}/health`);
    if (!resp.ok) throw new Error(await readError(resp));
    return (await resp.json()) as { status: string; version: string };
  }
}

/** The static build loads the Python engine lazily; the normal build never includes it. */
class LazyPyodide implements EngineClient {
  readonly failureHint = "the page could not start Python in this browser; check the connection and reload";
  private inner: Promise<EngineClient> | null = null;
  private listeners: ((status: string | null) => void)[] = [];

  private get(): Promise<EngineClient> {
    this.inner ??= import("./pyodide").then(({ PyodideEngine }) => {
      const e = new PyodideEngine();
      for (const l of this.listeners) e.onStatus(l);
      return e;
    });
    return this.inner;
  }
  onStatus(listener: (status: string | null) => void): void {
    this.listeners.push(listener);
  }
  async simulate(config: RunConfigJSON) {
    return (await this.get()).simulate(config);
  }
  async presets() {
    return (await this.get()).presets();
  }
  async health() {
    return (await this.get()).health();
  }
  async ensemble(config: RunConfigJSON, runs: number, seed0?: number) {
    return (await this.get()).ensemble(config, runs, seed0);
  }
}

export const engine: EngineClient = import.meta.env.VITE_ENGINE === "pyodide" ? new LazyPyodide() : new HttpEngine();

/**
 * The desktop app opened in a browser stops once no page holds its session stream open
 * (`qramsim.desktop`); the health reply says whether this server wants that.
 */
export async function holdSession(): Promise<void> {
  if (!(engine instanceof HttpEngine)) return;
  try {
    const health = (await engine.health()) as { session?: string };
    if (health.session !== "hold") return;
    engine.failureHint = "the app has stopped: open qram-walkers again";
    new EventSource("/api/session");
  } catch {
    // no server: the page says so when it first asks for a run
  }
}
