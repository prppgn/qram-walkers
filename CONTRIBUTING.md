# Contributing

Questions and bug reports are welcome as GitHub issues, changes as pull requests. This page
says how to run the tests and how the code is organised; [INSTALL.md](INSTALL.md) says how to
install the tools (uv, Node.js 20 or newer, pnpm).

## Running the tests

Engine (Python), in `engine/`:

```bash
uv run pytest
uv run ruff format --check src tests && uv run ruff check src tests
uv run mypy --strict src/qramsim
```

Viewer (TypeScript), in `viewer/`:

```bash
pnpm install
pnpm typecheck && pnpm test
pnpm e2e
pnpm build:static && pnpm e2e:static
```

`pnpm e2e` starts the engine and the viewer and drives the interface in a browser: Google
Chrome on macOS; elsewhere run `pnpm exec playwright install chromium` once. GitHub Actions
runs all of these at every push.

## How the code is organised

* **The physics lives only in the engine** (`engine/src/qramsim`). The viewer (`viewer/src`)
  renders the trajectories the engine writes and never routes a walker or applies a gate.
* Ideal gates are permutations of basis states on a sparse state. Noise is applied as Kraus
  channels sampled with quantum jumps, from a seed, so every run is reproducible.
* Every variant is checked against Eq. (1) of the paper exactly (`engine/tests/test_eq1.py`),
  and inverse routing is the exact time reversal of routing.
* The user guide is in `docs/user-guide/` and is shown inside the program. A change that the
  user can see needs its guide page and the tooltip of its control; the end-to-end tests check
  that every control has both.
* `engine/tests/golden/` and `viewer/tests/fixtures/` hold small recorded runs. Refresh the
  golden files, when a change of the trajectory format is intended, with
  `QRAMSIM_UPDATE_GOLDEN=1 uv run pytest tests/test_trajectory.py`.
* Some comments cite the authors' internal design notes (`PROTOCOL.md`, `DESIGN.md`, decisions
  such as `D27`). They are not part of this repository; the user guide covers the same ground.

## The papers

The protocol is described in the letter arXiv:2508.02855, cited as "the paper", and in a
companion technical paper in preparation, cited as "technical paper, §Section" or "technical
paper, Eq. (label)". Please follow the same convention.

## Commit messages

Start with the part the commit touches: `engine:`, `viewer:`, `docs:`, `tests:`, `ci:`.
