// EngineClient of the static build: the engine runs in a Web Worker (pyodide.worker.ts);
// the wheel is published next to the page (viewer/scripts/build-static.mjs).
import {
  checkTrajectory,
  type EnsembleJSON,
  type PresetJSON,
  type RunConfigJSON,
  type Trajectory,
} from "../model/types";
import type { EngineClient } from "./client";

interface Pending {
  resolve(text: string): void;
  reject(error: Error): void;
}

export class PyodideEngine implements EngineClient {
  readonly failureHint = "the page could not start Python in this browser; check the connection and reload";
  private worker: Worker | null = null;
  private wheel: Promise<string> | null = null;
  private next = 0;
  private pending = new Map<number, Pending>();
  private listeners: ((status: string | null) => void)[] = [];

  onStatus(listener: (status: string | null) => void): void {
    this.listeners.push(listener);
  }

  private wheelUrl(): Promise<string> {
    this.wheel ??= (async () => {
      const base = new URL("engine/", document.baseURI);
      const resp = await fetch(new URL("wheel.json", base));
      if (!resp.ok) throw new Error(`the engine wheel is missing (${resp.status})`);
      const { wheel } = (await resp.json()) as { wheel: string };
      return new URL(wheel, base).href;
    })();
    return this.wheel;
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL("./pyodide.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<{ id?: number; status?: string | null; out?: string; error?: string }>) => {
      const m = e.data;
      if (m.id === undefined) {
        for (const l of this.listeners) l(m.status ?? null);
        return;
      }
      const job = this.pending.get(m.id);
      if (!job) return;
      this.pending.delete(m.id);
      if (m.error !== undefined) job.reject(new Error(m.error));
      else job.resolve(m.out ?? "");
    };
    worker.onerror = (e) => {
      for (const job of this.pending.values()) job.reject(new Error(e.message || "the engine worker failed"));
      this.pending.clear();
    };
    this.worker = worker;
    return worker;
  }

  private async request<T>(method: string, payload?: unknown): Promise<T> {
    const wheelUrl = await this.wheelUrl();
    const worker = this.start();
    const id = this.next++;
    const text = await new Promise<string>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, wheelUrl, method, payload });
    });
    const reply = JSON.parse(text) as { ok: boolean; result?: T; error?: string };
    if (!reply.ok) throw new Error(reply.error ?? "the engine refused the request");
    return reply.result as T;
  }

  async simulate(config: RunConfigJSON): Promise<Trajectory> {
    return checkTrajectory(await this.request<unknown>("simulate", config));
  }

  presets(): Promise<PresetJSON[]> {
    return this.request<PresetJSON[]>("presets");
  }

  health(): Promise<{ status: string; version: string }> {
    return this.request("health");
  }

  ensemble(config: RunConfigJSON, runs: number, seed0 = 0): Promise<EnsembleJSON> {
    return this.request<EnsembleJSON>("ensemble", { config, runs, seed0 });
  }
}
