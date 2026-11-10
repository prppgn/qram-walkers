// Web Worker of the static build: runs the engine (the qramsim wheel, numpy from Pyodide)
// in the browser, so that a page with no backend computes the same trajectories as
// `qramsim serve`. Requests go through qramsim.webapi.call, the door the server also uses.

export {};

const PYODIDE_URL = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";

interface PyodideApi {
  loadPackage(names: string[]): Promise<void>;
  runPythonAsync(code: string): Promise<unknown>;
  globals: { set(name: string, value: unknown): void };
  pyimport(name: string): { call(method: string, payload: string): string };
}

type WorkerRequest = { id: number; wheelUrl: string; method: string; payload: unknown };
const ctx = self as unknown as {
  postMessage(message: unknown): void;
  onmessage: ((e: MessageEvent<WorkerRequest>) => void) | null;
};

function report(text: string | null): void {
  ctx.postMessage({ status: text });
}

async function boot(wheelUrl: string): Promise<ReturnType<PyodideApi["pyimport"]>> {
  report("downloading Python (first visit: about 20 MB)…");
  const { loadPyodide } = (await import(/* @vite-ignore */ `${PYODIDE_URL}pyodide.mjs`)) as {
    loadPyodide(opts: { indexURL: string }): Promise<PyodideApi>;
  };
  const py = await loadPyodide({ indexURL: PYODIDE_URL });
  report("installing numpy…");
  await py.loadPackage(["numpy", "micropip"]);
  report("installing the engine…");
  py.globals.set("wheel_url", wheelUrl);
  // deps=False: the server and plotting dependencies of the wheel are not used here.
  await py.runPythonAsync("import micropip\nawait micropip.install(wheel_url, deps=False)\nimport qramsim.webapi");
  report(null);
  return py.pyimport("qramsim.webapi");
}

let api: ReturnType<typeof boot> | null = null;

ctx.onmessage = (e) => {
  const { id, wheelUrl, method, payload } = e.data;
  api ??= boot(wheelUrl);
  api
    .then((py) => ctx.postMessage({ id, out: py.call(method, JSON.stringify(payload ?? null)) }))
    .catch((err: unknown) => {
      report(null);
      ctx.postMessage({ id, error: err instanceof Error ? err.message : String(err) });
    });
};
