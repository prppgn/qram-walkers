"""Noise models: configuration, Kraus channels, quantum-jump sampling (DESIGN.md §4).

Stochastic channels are lists of *monomial* Kraus operators on one slot's local state
(``{∅, R, B}``, or an empty slot and the four or six states of the qudit and dual-rail
alphabets, DECISION D35): every operator maps each basis state to at most one basis state with a
coefficient, so applying a channel never increases the number of branches. A channel is
applied to one slot at a time with the Monte Carlo wavefunction rule: ``ψ_i = K_i ψ``,
``p_i = ‖ψ_i‖² / ‖ψ‖²``, pick ``i`` with the run's RNG, ``ψ ← ψ_i · ‖ψ‖/‖ψ_i‖``. This is an
exact unravelling of the channel and includes the no-jump back-action (not seeing a loss
makes the branches where the walker is absent more likely).

The other models have state-independent outcome probabilities and are sampled as
classical events shared by all branches: gate failures, inverted copies, clock jitter,
flipped memory bits (DECISION D27).
"""

from __future__ import annotations

import math
from collections.abc import Callable, Iterable, Mapping
from dataclasses import dataclass, field
from typing import TYPE_CHECKING, Any

import numpy as np

from .alphabet import (
    BLUE,
    COLOUR_NOT,
    EMPTY,
    NO_WALKER,
    QUDIT_LOGICAL_NOT,
    RED,
    Family,
    alphabet,
    from_short,
    glyph,
    short,
)
from .config import ConfigError
from .train import SlotRole

if TYPE_CHECKING:
    from .state import Branch, SparseState
    from .variants import Variant

# A monomial Kraus operator: local state → (new local state, coefficient).
KrausOp = Mapping[int, tuple[int, complex]]

LOCATIONS = ("propagation", "gate", "scattering", "memory", "idle")
PHASES = ("routing", "query", "inverse")
TARGET_GROUPS = ("all", "address", "data", "backup", "flag")

STOCHASTIC = frozenset(
    {
        "loss",
        "bit_flip",
        "colour_dephasing",
        "presence_dephasing",
        "logical_dephasing",
        "logical_flip",
        "depolarizing",
        "scatter_flip",
    }
)
ON_MODES = ("colour", "logical", "both")  # what `depolarizing` acts on (D35)
CLASSICAL = frozenset({"gate_failure", "clock_jitter", "copy_error", "memory_bit_flip"})
COHERENT = frozenset({"overrotation", "beam_splitter_imbalance"})
BACKWARD_MODES = ("adjoint", "reciprocal")
X_GATE_TYPES = frozenset({"U", "U_in", "U_B"})


@dataclass(frozen=True)
class ModelSpec:
    name: str
    default_where: tuple[str, ...]
    description: str
    fixed_where: bool = False


MODELS: dict[str, ModelSpec] = {
    m.name: m
    for m in (
        ModelSpec("loss", ("propagation",), "the walker disappears (∅) with probability p"),
        ModelSpec("bit_flip", ("gate",), "the colour flips (X̂) with probability p"),
        ModelSpec("colour_dephasing", ("propagation",), "phase flip between |R⟩ and |B⟩"),
        ModelSpec("presence_dephasing", ("propagation",), "phase flip between present and ∅"),
        ModelSpec(
            "logical_dephasing",
            ("propagation",),
            "phase flip of the logical value (○ or ↑; ∅ on bosonic variants)",
        ),
        ModelSpec("logical_flip", ("gate",), "the logical value flips: ○ ↔ ● or ↑ ↔ ↓"),
        ModelSpec("depolarizing", ("gate",), "depolarising channel on span{|R⟩, |B⟩}"),
        ModelSpec(
            "scatter_flip",
            ("scattering",),
            "colour flip right before a bifurcation: the walker takes the wrong branch",
            fixed_where=True,
        ),
        ModelSpec("gate_failure", ("gate", "memory"), "a gate silently does not fire"),
        ModelSpec("clock_jitter", ("gate", "memory"), "a gate fires one tick early or late"),
        ModelSpec("copy_error", ("memory",), "a copy reads the stored bit inverted"),
        ModelSpec("memory_bit_flip", (), "stored bits flipped before the run"),
        ModelSpec(
            "overrotation",
            ("gate",),
            "coherent over-rotation of every colour flip: X̂ → cos θ X̂ − i sin θ Î",
        ),
        ModelSpec(
            "beam_splitter_imbalance",
            ("scattering",),
            "coherent mixing of the two output ports of every bifurcation",
            fixed_where=True,
        ),
    )
}


def _monomial(entries: dict[int, tuple[int, complex]]) -> KrausOp:
    return dict(entries)


def vacuum_code(family: Family) -> int:
    """Code of an empty slot in the Kraus tables of a family."""
    return EMPTY if family is Family.BOSONIC else NO_WALKER


def _present_states(family: Family) -> tuple[int, ...]:
    """Local states of a present walker (dual-rail: with the auxiliary rail)."""
    return tuple(x for x in alphabet(family) if x != EMPTY or family is not Family.BOSONIC)


def _is_blue(family: Family, s: int) -> bool:
    return short(family, s).endswith("B")


def _logical(family: Family, s: int) -> int | None:
    """Logical value of a local state; ``None`` where it has none (bosonic, auxiliary rail)."""
    name = short(family, s)
    if family is Family.BOSONIC or name[0] == "x":
        return None
    return 0 if name[0] in "ou" else 1


def _logical_not(family: Family, s: int) -> int:
    if family is Family.QUDIT:
        return QUDIT_LOGICAL_NOT[s]
    bit = _logical(family, s)
    if bit is None:
        return s
    name = short(family, s)
    return from_short(family, ("d" if bit == 0 else "u") + name[1])


Monomial = Callable[[int], tuple[int, complex]]


def _colour_paulis(family: Family) -> dict[str, Monomial]:
    """X̂, Ŷ, Ẑ on the colour (R ≡ |0⟩, B ≡ |1⟩); the logical value is kept."""
    flip = COLOUR_NOT[family]
    return {
        "I": lambda s: (s, 1),
        "X": lambda s: (flip[s], 1),
        "Y": lambda s: (flip[s], -1j if _is_blue(family, s) else 1j),
        "Z": lambda s: (s, -1 if _is_blue(family, s) else 1),
    }


def _logical_paulis(family: Family) -> dict[str, Monomial]:
    """X̂ᴸ, Ŷᴸ, Ẑᴸ on the logical value (○, ↑ ≡ |0⟩); Ẑᴸ takes its sign on logical 0.
    Identity where there is no logical value (the auxiliary rail)."""

    def y(s: int) -> tuple[int, complex]:
        bit = _logical(family, s)
        return _logical_not(family, s), 1 if bit is None else (1j if bit == 0 else -1j)

    def z(s: int) -> tuple[int, complex]:
        return s, -1 if _logical(family, s) == 0 else 1

    return {"I": lambda s: (s, 1), "X": lambda s: (_logical_not(family, s), 1), "Y": y, "Z": z}


def _two_term(family: Family, p: float, error: Monomial, vacuum: complex = 1) -> list[KrausOp]:
    """``{√(1−p) Î, √p E}`` with ``E`` acting on the present states, ``vacuum`` on an empty slot."""
    q, s = math.sqrt(1 - p), math.sqrt(p)
    vac = vacuum_code(family)
    states = _present_states(family)
    k0: dict[int, tuple[int, complex]] = {vac: (vac, q), **{x: (x, q) for x in states}}
    k1: dict[int, tuple[int, complex]] = {vac: (vac, s * vacuum)}
    for x in states:
        new, coef = error(x)
        k1[x] = (new, s * coef)
    return [_monomial(k0), _monomial(k1)]


def _depolarizing(family: Family, p: float, on: str) -> list[KrausOp]:
    vac = vacuum_code(family)
    states = _present_states(family)
    colour = _colour_paulis(family)
    logical = _logical_paulis(family)
    if on == "both":
        pairs = [(a, b) for a in "IXYZ" for b in "IXYZ"]
        a0, c = math.sqrt(1 - 15 * p / 16), math.sqrt(p / 16)
    else:
        pairs = [("I", b) if on == "colour" else (b, "I") for b in "IXYZ"]
        a0, c = math.sqrt(1 - 3 * p / 4), math.sqrt(p / 4)
    ops: list[KrausOp] = []
    for pl, pc in pairs:
        if pl == "I" and pc == "I":
            ops.append(_monomial({vac: (vac, 1), **{x: (x, a0) for x in states}}))
            continue
        op: dict[int, tuple[int, complex]] = {}
        for x in states:
            mid, c1 = logical[pl](x)
            new, c2 = colour[pc](mid)
            op[x] = (new, c * c1 * c2)
        ops.append(_monomial(op))
    return ops


def kraus_ops(
    model: str, p: float, family: Family = Family.BOSONIC, on: str = "colour"
) -> list[KrausOp]:
    """Monomial Kraus operators of a stochastic model on a family's alphabet (DESIGN.md §4.2,
    DECISION D35)."""
    vac = vacuum_code(family)
    colour = _colour_paulis(family)
    if model == "loss":
        q, s = math.sqrt(1 - p), math.sqrt(p)
        states = _present_states(family)
        no_jump = {vac: (vac, complex(1)), **{x: (x, complex(q)) for x in states}}
        return [_monomial(no_jump), *[_monomial({x: (vac, s)}) for x in states]]
    if model in ("bit_flip", "scatter_flip"):
        return _two_term(family, p, colour["X"])
    if model == "colour_dephasing":  # Z = |R⟩⟨R| − |B⟩⟨B|, identity on ∅
        return _two_term(family, p, colour["Z"])
    if model == "presence_dephasing":  # Z′ = |R⟩⟨R| + |B⟩⟨B| − |∅⟩⟨∅|
        return _two_term(family, p, colour["I"], vacuum=-1)
    if model == "logical_dephasing":  # on bosonic variants the logical 0 is ∅: the same as Z′
        if family is Family.BOSONIC:
            return _two_term(family, p, colour["I"], vacuum=-1)
        return _two_term(family, p, _logical_paulis(family)["Z"])
    if model == "logical_flip":
        return _two_term(family, p, _logical_paulis(family)["X"])
    if model == "depolarizing":  # on span{R, B} by default; identity on an empty slot
        return _depolarizing(family, p, on)
    raise ValueError(f"{model} is not a stochastic channel")


def kraus_labels(model: str, family: Family, on: str = "colour") -> tuple[str, ...]:
    """What each Kraus operator of a model does, for the narration of the new alphabets
    (the bosonic sentences are in narration.py)."""
    if family is Family.BOSONIC:
        return ()
    x, z = "X̂ᶜ" if family is Family.QUDIT else "X̂", "Ẑᶜ" if family is Family.QUDIT else "Ẑ"
    if model == "loss":
        names = [f"lost ({glyph(family, s)} → ∅)" for s in _present_states(family)]
        return ("no loss", *names)
    if model == "bit_flip":
        return ("no flip", f"colour flipped by {x}")
    if model == "scatter_flip":
        return (
            "no flip",
            f"colour flipped by {x} right before the bifurcation: it takes the wrong branch",
        )
    if model == "colour_dephasing":
        return ("no error", f"phase-flipped by {z} (a blue walker gets a minus sign)")
    if model == "logical_dephasing":
        what = "○" if family is Family.QUDIT else "↑"
        return ("no error", f"phase-flipped by Ẑᴸ (the {what} component gets a minus sign)")
    if model == "logical_flip":
        what = "logical NOT X̂ᴸ" if family is Family.QUDIT else "rail exchange ↑ ↔ ↓"
        return ("no error", f"hit by the {what}")
    if model == "depolarizing":
        return ("no error", *[f"hit by the error {i} of {on} depolarising" for i in range(1, 16)])
    return ()


def overrotation_matrix(theta: float, vacuum_phase: bool = False) -> np.ndarray:
    """X̂_ε = cos θ X̂ − i sin θ Î on the colour of a present walker, identity on ∅
    (DECISION D31); with ``vacuum_phase`` the literal formula also gives ∅ the phase
    e^{−iθ}."""
    x = np.array([[1, 0, 0], [0, 0, 1], [0, 1, 0]], dtype=complex)
    u = math.cos(theta) * x - 1j * math.sin(theta) * np.eye(3)
    if not vacuum_phase:
        u[0, 0] = 1
    return u


def port_mixer(phi: float) -> np.ndarray:
    """Symmetric beam splitter on the two child ports (left, right)."""
    c, s = math.cos(phi), math.sin(phi)
    return np.array([[c, 1j * s], [1j * s, c]])


def imbalanced_scattering(phi: float, mode: str) -> np.ndarray:
    """Single-walker scattering matrix of an imbalanced node on the six modes
    (colour × port), columns = incoming, rows = outgoing: ``forward`` = M·Ŝ, ``adjoint``
    = its adjoint (the engine's backward crossing), ``reciprocal`` = its transpose."""
    from .gates import S_TABLE, Port

    basis = [(c, p) for p in (Port.PARENT, Port.LEFT, Port.RIGHT) for c in (RED, BLUE)]
    index = {b: i for i, b in enumerate(basis)}
    s_mat = np.zeros((6, 6), dtype=complex)
    for src, dst in S_TABLE.items():
        s_mat[index[dst], index[src]] = 1
    mix = np.eye(6, dtype=complex)
    m = port_mixer(phi)
    for c in (RED, BLUE):
        ports = [index[(c, Port.LEFT)], index[(c, Port.RIGHT)]]
        for a in range(2):
            for b in range(2):
                mix[ports[a], ports[b]] = m[a, b]
    fwd = mix @ s_mat
    if mode == "forward":
        return fwd
    if mode == "adjoint":
        return fwd.conj().T
    if mode == "reciprocal":
        return fwd.T
    raise ValueError(mode)


def kraus_matrix(op: KrausOp, family: Family = Family.BOSONIC) -> np.ndarray:
    """Matrix of a monomial Kraus operator in the basis (empty slot, present states)."""
    basis = [vacuum_code(family), *_present_states(family)]
    index = {s: i for i, s in enumerate(basis)}
    mat = np.zeros((len(basis), len(basis)), dtype=complex)
    for src, (dst, coef) in op.items():
        mat[index[dst], index[src]] += coef
    return mat


@dataclass(frozen=True)
class NoiseChannel:
    """One configured noise entry, resolved against a variant."""

    index: int
    model: str
    p: float = 0.0
    p_early: float = 0.0
    p_late: float = 0.0
    where: frozenset[str] = frozenset()
    targets: frozenset[int] = frozenset()
    phases: frozenset[str] = frozenset(PHASES)
    gates: frozenset[str] | None = None
    kraus: tuple[KrausOp, ...] = field(default=(), compare=False, repr=False)
    epsilon: float = 0.0  # over-rotation ε or beam-splitter η (coherent models)
    sigma: float = 0.0
    backward: str = "reciprocal"  # DECISION D31
    vacuum_phase: bool = False  # DECISION D31
    vacuum: int = EMPTY  # code of an empty slot in the Kraus tables
    labels: tuple[str, ...] = field(default=(), compare=False, repr=False)

    @property
    def active(self) -> bool:
        if self.model in COHERENT:
            return self.epsilon != 0 or self.sigma > 0
        return self.p > 0 or self.p_early > 0 or self.p_late > 0

    def describe(self) -> str:
        if self.model == "clock_jitter":
            return f"clock_jitter (p_early = {self.p_early:g}, p_late = {self.p_late:g})"
        if self.model == "overrotation":
            return f"overrotation (ε = {self.epsilon:g}, σ = {self.sigma:g})"
        if self.model == "beam_splitter_imbalance":
            return f"beam_splitter_imbalance (η = {self.epsilon:g}, σ = {self.sigma:g})"
        return f"{self.model} (p = {self.p:g})"


def _prob(entry: Mapping[str, Any], key: str, model: str) -> float:
    value = entry.get(key, 0.0)
    try:
        p = float(value)
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"noise {model}: {key} must be a number") from exc
    if not 0.0 <= p <= 1.0:
        raise ConfigError(f"noise {model}: {key} = {p} outside [0, 1]")
    return p


def _targets(spec: Any, variant: Variant, model: str) -> frozenset[int]:
    slots = variant.slots
    groups = {
        "all": [s.index for s in slots],
        "address": [s.index for s in slots if s.role is SlotRole.ADDRESS],
        "data": [s.index for s in slots if s.role is SlotRole.DATA],
        "backup": [s.index for s in slots if s.backup],
        "flag": [s.index for s in slots if s.role in (SlotRole.FLAG, SlotRole.DELIMITER)],
    }
    names = [spec] if isinstance(spec, str) else list(spec)
    out: set[int] = set()
    by_name = {s.name: s.index for s in slots}
    for name in names:
        if name in groups:
            out.update(groups[name])
        elif name in by_name:
            out.add(by_name[name])
        else:
            raise ConfigError(
                f"noise {model}: unknown target {name!r} (use {', '.join(TARGET_GROUPS)} "
                f"or slot names such as {', '.join(by_name)})"
            )
    return frozenset(out)


def parse_noise(entries: Iterable[Mapping[str, Any]], variant: Variant) -> list[NoiseChannel]:
    """Validate the ``noise`` list of a run configuration (DESIGN.md §4.1)."""
    channels = []
    for i, entry in enumerate(entries):
        model = str(entry.get("model", ""))
        spec = MODELS.get(model)
        if spec is None:
            raise ConfigError(f"unknown noise model {model!r} (available: {', '.join(MODELS)})")
        family = variant.family
        bosonic = family is Family.BOSONIC
        if model == "presence_dephasing" and not bosonic:
            raise ConfigError(
                f"presence_dephasing has nothing to act on in the {variant.name} variant: its "
                "walkers are always present; use logical_dephasing"
            )
        if model == "logical_flip" and bosonic:
            raise ConfigError(
                f"logical_flip is not defined on the {variant.name} variant: there the logical "
                "value is the presence of a walker"
            )
        on = str(entry.get("on", "colour"))
        if on not in ON_MODES:
            raise ConfigError(f"noise {model}: on must be one of {ON_MODES}, got {on!r}")
        if on != "colour" and (model != "depolarizing" or bosonic):
            raise ConfigError(
                f"noise {model}: on = {on!r} exists only for depolarizing on the qudit and "
                "dual-rail variants"
            )
        where = entry.get("where", list(spec.default_where))
        if isinstance(where, str):
            where = [where]
        if spec.fixed_where:
            where = list(spec.default_where)
        for w in where:
            if w not in LOCATIONS:
                raise ConfigError(f"noise {model}: unknown location {w!r} (use {LOCATIONS})")
        phases = entry.get("phases", list(PHASES))
        for ph in phases:
            if ph not in PHASES:
                raise ConfigError(f"noise {model}: unknown phase {ph!r} (use {PHASES})")
        gates = entry.get("gates")
        if (
            model == "clock_jitter"
            and _prob(entry, "p_early", model) + _prob(entry, "p_late", model) > 1
        ):
            raise ConfigError("noise clock_jitter: p_early + p_late must not exceed 1")
        if model in COHERENT:
            if entry.get("vacuum_phase") and not bosonic:
                raise ConfigError(
                    f"noise {model}: vacuum_phase exists only on the bosonic variants, where a "
                    "gate target can be empty"
                )
            channels.append(_coherent(i, model, entry, where, phases, gates))
            continue
        channel = NoiseChannel(
            index=i,
            model=model,
            p=_prob(entry, "p", model) if model != "clock_jitter" else 0.0,
            p_early=_prob(entry, "p_early", model) if model == "clock_jitter" else 0.0,
            p_late=_prob(entry, "p_late", model) if model == "clock_jitter" else 0.0,
            where=frozenset(where),
            targets=_targets(entry.get("targets", "all"), variant, model),
            phases=frozenset(phases),
            gates=None if gates is None else frozenset(str(g) for g in gates),
            kraus=(
                tuple(kraus_ops(model, _prob(entry, "p", model), family, on))
                if model in STOCHASTIC
                else ()
            ),
            vacuum=vacuum_code(family),
            labels=kraus_labels(model, family, on),
        )
        channels.append(channel)
    return channels


def _coherent(
    index: int,
    model: str,
    entry: Mapping[str, Any],
    where: list[str],
    phases: list[str],
    gates: Any,
) -> NoiseChannel:
    key = "epsilon" if model == "overrotation" else "eta"
    try:
        value = float(entry.get(key, 0.0))
        sigma = float(entry.get("sigma", 0.0))
    except (TypeError, ValueError) as exc:
        raise ConfigError(f"noise {model}: {key} and sigma must be numbers") from exc
    if not -1.0 <= value <= 1.0:
        raise ConfigError(f"noise {model}: {key} = {value} outside [−1, 1]")
    if sigma < 0:
        raise ConfigError(f"noise {model}: sigma must be non-negative")
    backward = str(entry.get("backward", "reciprocal"))
    if backward not in BACKWARD_MODES:
        raise ConfigError(f"noise {model}: backward must be one of {BACKWARD_MODES}")
    if model == "overrotation":
        gate_set = frozenset(str(g) for g in gates) if gates is not None else X_GATE_TYPES
    else:
        gate_set = None
    return NoiseChannel(
        index=index,
        model=model,
        where=frozenset(where),
        phases=frozenset(phases),
        gates=gate_set,
        epsilon=value,
        sigma=sigma,
        backward=backward,
        vacuum_phase=bool(entry.get("vacuum_phase", False)),
    )


# ---------------------------------------------------------------------------
# Quantum-jump application.


@dataclass(frozen=True)
class Jump:
    """Outcome of one channel application that is reported (a non-identity operator)."""

    channel: NoiseChannel
    k: int
    op: int
    branches: tuple[int, ...]  # branch ids where the operator acted non-trivially
    probability: float


def apply_channel(
    state: SparseState,
    channel: NoiseChannel,
    k: int,
    mask: Callable[[Branch], bool],
    rng: np.random.Generator,
) -> tuple[SparseState, Jump | None]:
    """Apply ``channel`` to slot ``k`` in the branches selected by ``mask`` (identity
    elsewhere, folded into the first operator) and sample one Kraus outcome."""
    from .state import SparseState

    branches = list(state)
    norm = sum(abs(b.amp) ** 2 for b in branches)
    if norm == 0:
        return state, None
    ops = channel.kraus
    weights = [0.0] * len(ops)
    selected = [(not b.collided) and mask(b) for b in branches]
    for b, sel in zip(branches, selected, strict=True):
        p2 = abs(b.amp) ** 2
        if not sel:
            weights[0] += p2
            continue
        s = b.slots[k].s if b.present[k] else channel.vacuum
        for i, op in enumerate(ops):
            hit = op.get(s)
            if hit is not None:
                weights[i] += p2 * abs(hit[1]) ** 2
    probs = [w / norm for w in weights]
    r = rng.random()
    acc = 0.0
    choice = len(ops) - 1
    for i, pr in enumerate(probs):
        acc += pr
        if r < acc:
            choice = i
            break
    while probs[choice] == 0.0:  # guard against rounding at the end of the cumulative sum
        choice -= 1
    op = ops[choice]
    scale = math.sqrt(norm / weights[choice])
    out = SparseState(next_bid=state.next_bid)
    touched: list[int] = []
    for b, sel in zip(branches, selected, strict=True):
        if not sel:
            if choice == 0:
                out.add(b.copy_with(amp=b.amp * scale))
            continue
        s = b.slots[k].s if b.present[k] else channel.vacuum
        hit = op.get(s)
        if hit is None or hit[1] == 0:
            continue
        new_s, coef = hit
        new_b = b
        if new_s != s:
            touched.append(b.bid)
            present = list(b.present)
            slots = list(b.slots)
            if new_s == channel.vacuum:
                present[k] = False  # the record stays as the ghost, last colour kept
            else:
                present[k] = True
                slots[k] = slots[k]._replace(s=new_s)
            new_b = b.copy_with(slots=tuple(slots), present=tuple(present))
        elif coef != abs(coef) and choice != 0:
            touched.append(b.bid)
        out.add(new_b.copy_with(amp=b.amp * coef * scale))
    if choice == 0:
        return out, None
    return out, Jump(channel, k, choice, tuple(sorted(touched)), probs[choice])
