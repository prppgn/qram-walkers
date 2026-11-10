# viewer

Web viewer of qramsim trajectories (Vite + React + TypeScript, SVG). It renders the
trajectories computed by the engine (`../engine`, schema `qramsim.traj/1`, printed by
`uv run qramsim schema`) and never computes physics: colours, positions and events all come
from the engine; the viewer interpolates between frames and formats kets.

To simply use the program, see `../INSTALL.md`: `uv run qramsim app` in `../engine` builds and
opens this interface.

## Run (development)

```bash
cd ../engine && uv sync && uv run qramsim serve        # engine API on :8765
cd ../viewer && pnpm install && pnpm dev               # http://localhost:5173 (proxies /api)
```

Or build once and let the engine serve everything:

```bash
pnpm build                                             # writes viewer/dist
cd ../engine && uv run qramsim serve                   # http://127.0.0.1:8765/
```

## Tests

```bash
pnpm typecheck
pnpm test        # vitest: layout math, ket formatting (checked against the engine's kets), stepping
pnpm e2e         # Playwright: starts both servers and drives the app; every control has a tooltip and a guide entry
pnpm build:static && pnpm e2e:static   # the static site, with the engine in the browser
```

## Structure

| path | role |
|---|---|
| `src/model/types.ts` | TypeScript mirror of the run and trajectory formats |
| `src/engine/client.ts`, `pyodide.ts` | `EngineClient`: HTTP (`qramsim serve`) or the engine in the browser (static site) |
| `src/layout/unfoldedH.ts` | tree geometry → pixels, mirrored output tree |
| `src/layout/kets.ts` | kets in the paper's notation |
| `src/playback/` | store, step modes, data-only interpolation between frames |
| `src/components/` | tree canvas, controls and timeline, train strip, help panel |
| `src/components/setup/` | setup drawer: architecture, address editor, memory grid, presets |
| `src/components/panels/` | kets, phasors, narration, events, metrics, resources, legend |
| `src/help/` | the user guide (`docs/user-guide/*.md`) rendered with KaTeX |
