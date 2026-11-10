# qramsim

Simulation engine of the quantum-walker quantum RAM (De Riso, Catalano, Lloyd,
Giovannetti, De Santis, arXiv:2508.02855). It is the single source of truth for the
physics: geometry, clock schedule, gates, time-reversed inverse routing, narration,
metrics and resources. Viewers only render the trajectories it writes
(`qramsim.traj/1`; `uv run qramsim schema` prints the JSON schemas). The physics as simulated
is described in the user guide, `../docs/user-guide/`, also shown inside the program.

## Quick start

```bash
uv sync
uv run qramsim presets                                   # named configurations
uv run qramsim run --preset E1 --print-kets              # the paper's ket sequence
uv run qramsim run --variant basic --n 3 --m 2 --address 101,010 --out traj.json
uv run qramsim run --variant basic --n 6 --m 4 --input uniform --out big.json
uv run qramsim export traj.json --format csv-events      # narrated event log
```

From Python:

```python
from qramsim import RunConfig, InputTerm, simulate

cfg = RunConfig(n=2, m=1, terms=(InputTerm("00", 1), InputTerm("11", 1)),
                memory=((1,), (0,), (0,), (0,)))
result = simulate(cfg)
result.metrics          # fidelity, success, consistency, entropy_AD, norm
result.trajectory.save("e2.json")
```

## Development

```bash
uv run pytest            # Eq. (1), time reversal, gate tables, invariants, JSON, golden kets
uv run ruff check src tests && uv run ruff format --check src tests
uv run mypy              # strict on src/qramsim
QRAMSIM_UPDATE_GOLDEN=1 uv run pytest tests/test_trajectory.py   # refresh golden JSON
```

## Modules

| module | role |
|---|---|
| `alphabet` | local-state alphabets (`∅,R,B`; qudit; dual-rail) |
| `geometry` | tree, edge lengths, path coordinate `X(d,s)`, cell/address map |
| `train` | slots of the train (`A_i`, `D_0`, `D_j`, `D_{m+1}`, backups) |
| `state` | sparse state: branches keyed by present walkers; ghosts kept out of the key |
| `gates`, `rules` | gate tables, and per-variant scattering, activation and target tables |
| `schedule` | clock-scheduled gate instances, phases, time reversal |
| `variants/` | `basic`, `backup`, `qudit_short`, `qudit_long`, `dualrail_basic`, `dualrail_backup` |
| `noise` | noise models: Kraus channels with quantum jumps, classical and coherent errors |
| `simulator` | tick loop, mover, strict-mode invariants |
| `trajectory` | JSON format, recorder, validation |
| `narration` | English sentence for every event |
| `kets` | kets in the paper's notation, level-synchronous checkpoints |
| `metrics`, `resources` | output metrics, counters and the paper's formulas |
| `presets`, `sweeps`, `scaling` | named configurations, ensembles and sweeps, measured depths |
| `webapi`, `server`, `render`, `cli` | JSON door shared by the server and the browser, HTTP API, video and figures, command line |
