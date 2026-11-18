"""English narration of engine events (DESIGN.md §3.5, DECISION D8).

Every event recorded in a trajectory carries a sentence generated here, so the CLI and
the viewer share the wording. Sentences use the paper's notation (Û⁽ᵈ⁾, Ŝ, Ŝ†, |R⟩,
|B⟩, ∅, (d,l)). When many branches are involved the text summarises; the structured
event fields keep every detail.

Each event also carries a plain sentence (``text_plain``, the ``*_plain`` functions at the
end): the same facts in simpler words, without coordinates or clock times.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any, NamedTuple

from .gates import GateKind
from .schedule import GateInstance, Phase, Schedule
from .train import Slot

if TYPE_CHECKING:
    from .variants import Variant

MAX_LISTED = 3
_COPY_KINDS = (GateKind.COPY_GLOBAL, GateKind.COPY_CELL, GateKind.COPY_BACKUP)
_COLOUR = {"R": "red", "B": "blue", "E": "absent (∅)"}
_GLYPH = {
    "oR": "○R",
    "oB": "○B",
    "fR": "●R",
    "fB": "●B",
    "uR": "↑R",
    "uB": "↑B",
    "dR": "↓R",
    "dB": "↓B",
    "xR": "aux R",
    "xB": "aux B",
}


def _glyph(s: str) -> str:
    return _GLYPH.get(s, s)


def _family(variant: Variant) -> str:
    return str(variant.family)


def _is_backup(variant: Variant) -> bool:
    return variant.name in ("backup", "dualrail_backup")


def _branches(n_selected: int, n_total: int) -> str:
    if n_total == 1:
        return ""
    if n_selected == n_total:
        return " (in every branch)"
    return f" (in {n_selected} of {n_total} branches)"


def _names(variant: Variant, ks: Sequence[int]) -> str:
    labels = [variant.slots[k].label for k in ks]
    if len(labels) <= 4:
        return ", ".join(labels)
    return f"{labels[0]}, {labels[1]}, …, {labels[-1]} ({len(labels)} walkers)"


def phase_text(phase: str, variant: Variant, schedule: Schedule) -> str:
    n, K = variant.n, variant.K
    if phase == "routing":
        head = (
            f"Routing begins (ticks 0–{schedule.T_fwd - 1}). The train of K = {K} slots "
            f"({variant.slots[0].label} at the front, {variant.slots[-1].label} at the tail) "
            "enters the input port one site per tick. "
        )
        name = variant.name
        if name == "backup":
            gates = (
                "On every 4-site edge of level d, Û_in copies the colour of A_d onto its backup "
                "Ã_d; then Û_B, activated by a blue backup, flips the next walker and its backup, "
                "passing the bit two walkers at a time down the train. Gates of consecutive "
                "levels fire in the same ticks (pipelining)."
            )
        elif name == "qudit_short":
            gates = (
                "Every walker is a qudit (○ = 0, ● = 1, colour R/B), always present. On every "
                "2-site edge of level d, Û_in flips the colour of the walker behind A_d when A_d "
                "carries a 1 (●); then Û_B, activated by a blue walker, flips the next one, "
                "passing the bit down the train one walker per tick."
            )
        elif name == "qudit_long":
            gates = (
                "Every walker is a qudit (○ = 0, ● = 1, colour R/B), always present. On the "
                "edges of level d, Û⁽ᵈ⁾ = Û_○ ⊕ Û_● acts on the walkers behind A_d: a red ○ "
                "control flips the colour of the ○ walkers, a red ● control that of the ● "
                "walkers."
            )
        elif name == "dualrail_basic":
            gates = (
                "Every walker sits on one of two trees, ↑ (bit 0) or ↓ (bit 1). On each tree "
                "the gate Û⁽ᵈ,ʳ⁾ flips the colour of the walkers behind A_d on the tree of A_d."
            )
        elif name == "dualrail_backup":
            gates = (
                "Every walker sits on one of two trees, ↑ (bit 0) or ↓ (bit 1), and every "
                "carrier has a backup on each tree. Each tree runs the backup protocol: Û_in "
                "copies the colour of A_d onto its backup on the same tree, Û_B (blue control) "
                "passes the bit two walkers at a time."
            )
        else:
            gates = (
                "On the edges of level d the address-transmission gate Û⁽ᵈ⁾, controlled by A_d, "
                "flips the colour of every walker behind A_d when A_d is red."
            )
        if name == "qudit_long":
            scatter = (
                " At each bifurcation ●R turns left and ●B right (Ŝ), ○R right and ○B left "
                "(Ŝ X̂), the colour reset to red: the followers of A_d turn left "
                "for a_d = 0 and right for a_d = 1, A_d the other way."
            )
        elif _family(variant) == "dualrail":
            scatter = (
                " At each bifurcation Ŝ⁽↓⁾ = Ŝ sends red walkers left and blue ones right, "
                "Ŝ⁽↑⁾ = Ŝ X̂ the opposite, resetting the colour to red: the two trees are "
                "photographic negatives of each other."
            )
        else:
            scatter = (
                " At each bifurcation Ŝ sends red walkers left (bit 0) and blue walkers right "
                "(bit 1), resetting them to red."
            )
        return head + gates + scatter
    if phase == "query":
        if _is_backup(variant):
            down = "↓" if variant.name == "dualrail_backup" else ""
            mechanism = (
                f"Each data walker D_j is copied under the control of the backup in front of it "
                f"(Ã_n{down} for D₁, D̃_{{j−1}}{down} for D_j): the backups are present and red "
                "only in the lane(s) the train reached."
            )
        elif variant.copy_mode == "cell_switch":
            mechanism = (
                "In the addressed cell(s) the red flag D₀ switches the cell on (Û_on), the "
                "copies fire while the switch F is on and the delimiter switches it off (Û_off)."
            )
        else:
            mechanism = (
                "The global copy gates fire on the clock in every cell but act only where the "
                "flag D₀ is present and red, i.e. in the cell(s) addressed by the input."
            )
        family = _family(variant)
        if family == "qudit":
            copy = (
                "The local copy Û_copy^loc(D_j|M_j) applies the logical NOT X̂ᴸ (●R → ○R) where "
                "the stored bit b_j = 0 and leaves D_j in ●R where b_j = 1."
            )
        elif family == "dualrail":
            copy = (
                "The local copy Û_copy^loc(D_j|M_j) turns D_j blue where the stored bit b_j = 0. "
                "Then the output circuit of the cell moves the blue data walkers to the ↑ tree: "
                "Ŝ_M sends them to the auxiliary rail, Ŝ_M† onto ↑ (blue) and the clocked X̂_c "
                "resets them to red."
            )
        else:
            copy = (
                "The local copy Û_copy^loc(D_j|M_j) erases the data walker D_j (R → ∅) where "
                "the stored bit b_j = 0 and leaves it red where b_j = 1."
            )
        return (
            f"Query (ticks {schedule.T_fwd}–{schedule.T_fwd + schedule.T_q - 1}). Every walker "
            f"rests in a memory lane (each slot on its own lane site). {mechanism} {copy}"
        )
    if phase == "inverse":
        return (
            f"Inverse routing (ticks {schedule.T_fwd + schedule.T_q}–{schedule.T_total - 1}): "
            "the exact time reversal of routing. The train retraces its path "
            "tail-first; Ŝ† merges the paths at every bifurcation (a red walker arriving from "
            "the right child turns blue) and the same gates fire again in reverse order, "
            f"recollecting the dispersed address walkers. All {n} levels are undone and the "
            "walkers leave through the port they entered."
        )
    if phase == "done":
        return "Done: every walker has left the tree through the port; the output state is read."
    raise ValueError(phase)


def turn_text(variant: Variant) -> str:
    return (
        "End of the query: every walker reverses its direction; the inverse routing replays "
        "the forward schedule backwards in time."
    )


def _cell(variant: Variant, l: int) -> str:
    return f"cell {l} = |{variant.geometry.address_of_cell(l)}⟩"


class CopyRead(NamedTuple):
    """What one copy gate did to one data walker in one branch (both registers)."""

    branch: int  # branch id
    cell: str  # address of the memory cell, e.g. "10"
    target: str  # label of the data walker the copy is meant for
    walker: str | None  # label of the walker found on its site, "stray", or None if empty
    stored: int  # bit stored in the cell
    read: int  # bit the copy used (the stored bit, inverted by a copy error)
    before: str  # local state before the copy ("R", "fR", "dR"; "E" for no walker)
    after: str


def _ket(s: str) -> str:
    return "|∅⟩" if s == "E" else f"|{_glyph(s)}⟩"


def _join_or(items: Sequence[str]) -> str:
    """``A``, ``A or B``, ``A, B or C``."""
    return items[0] if len(items) == 1 else f"{', '.join(items[:-1])} or {items[-1]}"


def _ctrl_label(gate: GateInstance, variant: Variant) -> str:
    return (
        variant.slots[gate.control_slot].label if gate.control_slot is not None else "the control"
    )


def _active(kind: GateKind, family: str) -> tuple[str, str]:
    """What activates a walker-controlled gate: (``is red``, ``red walker``)."""
    if kind is GateKind.U_B:
        return "is blue", "blue walker"
    if kind is GateKind.U_IN and family == "qudit":
        return "carries a 1 (●)", "walker carrying a 1 (●)"
    return "is red", "red walker"


def _control_place(gate: GateInstance, variant: Variant) -> tuple[str, set[str]]:
    """Where the control sits and which walkers the protocol expects there.

    A dual-rail Û_B is controlled by the backup on either tree: the place is ``Ã₂`` and
    both ``Ã₂↑`` and ``Ã₂↓`` are expected (the schedule names the ↓ one)."""
    ctrl = _ctrl_label(gate, variant)
    if gate.kind is GateKind.U_B and _family(variant) == "dualrail" and ctrl[-1:] in ("↑", "↓"):
        place = ctrl[:-1]
        return place, {place + "↑", place + "↓"}
    return ctrl, {ctrl}


def _copy_result(
    reads: Sequence[CopyRead], family: str, changes: Sequence[Mapping[str, Any]], variant: Variant
) -> str:
    """What a copy did to its target sites, from the records of what it found there."""
    verb, kept = {
        "qudit": ("flips to ○R", "leaves the data walkers in ●R"),
        "dualrail": ("turns blue", "leaves the data walkers red"),
    }.get(family, ("erases", "leaves the data walkers red"))
    if not reads:  # no record of the target sites: what changed is all we know
        touched = Counter(variant.slots[int(c["k"])].label for c in changes)
        if not touched:
            return f"{kept} (stored bits = 1)"
        return f"{verb} " + ", ".join(f"{name} in {n} branch(es)" for name, n in touched.items())
    changed: Counter[str] = Counter()
    # what the copy found where its target walker is missing: (what, effect) → branches
    odd: Counter[tuple[str, str]] = Counter()
    unchanged = [r for r in reads if r.walker == r.target and r.before == r.after]
    for r in reads:
        if r.walker == r.target:
            if r.before != r.after:
                changed[r.target] += 1
        elif r.walker is None and r.after == "E":
            odd[(f"the site of {r.target} empty (∅)", "nothing to act on")] += 1
        elif r.walker is None:
            effect = f"b = {r.read} maps |∅⟩ → {_ket(r.after)}, a new walker"
            odd[(f"the site of {r.target} empty", effect)] += 1
        else:
            who = "a stray walker" if r.walker == "stray" else r.walker
            odd[(f"{who} on the site of {r.target}", f"{_ket(r.before)} → {_ket(r.after)}")] += 1
    parts = []
    if changed:
        parts.append(
            f"{verb} " + ", ".join(f"{name} in {n} branch(es)" for name, n in changed.items())
        )
    elif unchanged:
        bits = "stored bits = 1" if all(r.stored == r.read for r in unchanged) else "bits read = 1"
        parts.append(f"{kept} ({bits})")
    parts += [f"finds {what} in {n} branch(es): {effect}" for (what, effect), n in odd.items()]
    return "; ".join(parts)


def gate_text(
    gate: GateInstance,
    variant: Variant,
    fired_in: Sequence[int],
    n_branches: int,
    branch_names: Mapping[int, str],
    changes: Sequence[Mapping[str, Any]],
    *,
    reads: Sequence[CopyRead] = (),
    controls: Sequence[str] = (),
    ideal: bool = True,
    frozen: int = 0,
    failed: int = 0,
) -> str:
    """Sentence for one gate instance firing at one tick.

    The keyword arguments are what the engine saw, as for :func:`gate_plain`: ``controls``
    the walkers that activated the gate (named when they are not the scheduled control),
    ``reads`` what a copy found on each target site, ``frozen`` the branches stopped by a
    collision, ``failed`` the edges or memory lanes where a gate failure stopped it. With
    ``ideal`` false (noise has acted) an idle control is described by what sits on its site,
    not by the ideal protocol (an absent address walker)."""
    kind = gate.kind
    inverse = gate.phase is Phase.INVERSE
    head = f"{gate.label}" + (" (inverse routing; self-adjoint)" if inverse else "")
    ctrl = _ctrl_label(gate, variant)
    place, expected = _control_place(gate, variant)
    if controls and set(controls) <= expected:
        ctrl_now = _join_or(list(controls))
    elif controls:
        who = _join_or(["a stray walker" if c == "stray" else c for c in controls])
        ctrl_now = f"{who} (on the control site of {place})"
    else:
        ctrl_now = ctrl
    n_fired = len(fired_in)
    walker_changes = [c for c in changes if not c.get("ghost")]
    family = _family(variant)
    idle_ctrl = "absent (∅)" if family == "bosonic" else "not in an activating state"
    _, active_walker = _active(kind, family)
    cell_gate = kind in _COPY_KINDS or kind in (GateKind.CELL_ON, GateKind.CELL_OFF)
    unit = "memory lane(s)" if cell_gate else "edge(s)"
    flow = kind in (GateKind.OUT_S, GateKind.OUT_SDAG, GateKind.X_C)
    # a gate that fires nowhere because of noise says so
    if n_fired == 0 and not flow:
        if failed:
            return f"{head}: a gate failure stopped it on {failed} {unit} → identity everywhere."
        if frozen >= n_branches > 0:
            which = "its branch is" if n_branches == 1 else "every branch is"
            return f"{head}: {which} frozen by a collision → identity."

    def nowhere(idle: str, quantifier: str = " in any branch") -> str:
        """``idle`` in every branch that still runs (noisy runs)."""
        if frozen:
            return (
                f"{idle} in the branches still running, the other {frozen} branch(es) are frozen "
                "by a collision"
            )
        return idle + (quantifier if n_branches > 1 else "")

    def rest(idle: str, always: bool) -> str:
        """Why nothing happens in the branches where the gate did not fire."""
        n_rest = n_branches - n_fired
        if n_rest <= 0 or not (always or frozen or failed):
            return ""
        if not (frozen or failed):
            return f"; in the other {n_rest} branch(es) {idle} → identity"
        why = [idle] if n_rest > frozen else []
        if failed:
            why.append(f"a gate failure on {failed} {unit}")
        if frozen:
            why.append(f"{frozen} branch(es) frozen by a collision")
        return f"; in the other {n_rest} branch(es) nothing fires ({', or '.join(why)})"

    if flow:
        moved = sorted({int(c["k"]) for c in walker_changes})
        what = {
            GateKind.OUT_S: "sends the blue data walkers of the ↓ lane to the auxiliary rail, red",
            GateKind.OUT_SDAG: "merges the auxiliary rail into the ↑ lane: the walkers arrive blue",
            GateKind.X_C: "resets the data walkers on the ↑ lane to red (clocked colour NOT)",
        }[kind]
        if not moved:
            return f"{head} (output circuit of every cell) acts on no walker: nothing to move."
        return (
            f"{head} (output circuit of the cells) {what}: "
            f"{_names(variant, moved)}{_branches(n_fired, n_branches)}."
        )
    if kind is GateKind.U:
        n_edges = variant.geometry.n_edges(gate.level)
        where = (
            f"edge ({gate.level},1)"
            if n_edges == 1
            else f"the {n_edges} edges ({gate.level},·) of level {gate.level}"
        )
        idle = (
            f"{ctrl} is {idle_ctrl}"
            if ideal
            else f"no red walker sits on the control site of {ctrl}"
        )
        if n_fired == 0:
            if ideal and not frozen:
                return (
                    f"{head} fires on {where}: the control {ctrl} is {idle_ctrl} in every "
                    "branch → identity."
                )
            return f"{head} fires on {where}: {nowhere(idle)} → identity."
        flipped = sorted({int(c["k"]) for c in walker_changes})
        x = {"qudit": "X̂ᶜ'⁰ / X̂ᶜ'¹", "dualrail": "X̂ (on the tree of the control)"}.get(family, "X̂")
        what = f"{x} flips {_names(variant, flipped)}" if flipped else "no walker sits behind it"
        if family == "qudit":
            what += " (a red ○ control flips the ○ walkers, a red ● control the ● walkers)"
        if n_branches == 1:
            return f"{head} fires on {where}: {ctrl_now} is red → {what}."
        listed = ", ".join(branch_names.get(b, f"#{b}") for b in fired_in[:MAX_LISTED])
        more = "" if n_fired <= MAX_LISTED else f" and {n_fired - MAX_LISTED} more"
        return (
            f"{head} fires on {where}: {ctrl_now} is red in {n_fired} of {n_branches} branches "
            f"({listed}{more}) → {what} there{rest(idle, always=True)}."
        )
    if kind in (GateKind.U_IN, GateKind.U_B):
        n_edges = variant.geometry.n_edges(gate.level)
        where = (
            f"edge ({gate.level},1)"
            if n_edges == 1
            else f"the {n_edges} edges of level {gate.level}"
        )
        colour = "red" if kind is GateKind.U_IN else "blue"
        if family == "qudit" and kind is GateKind.U_IN:
            colour = "a 1 (●)"
        if not ideal:
            idle = f"no {active_walker} sits on the control site of {place}"
        elif len(expected) > 1:
            idle = f"neither {place}↑ nor {place}↓ is blue"
        elif kind is GateKind.U_IN:
            idle_in = {"qudit": "a 0 (○)", "bosonic": "absent (∅)"}.get(family, idle_ctrl)
            idle = f"the control {ctrl} is {idle_in}"
        else:
            idle = f"the control {ctrl} is {'red or absent' if family == 'bosonic' else 'red'}"
        if n_fired == 0:
            if ideal and not frozen:
                return f"{head} on {where}: {idle} everywhere → identity."
            return f"{head} on {where}: {nowhere(idle)} → identity."
        flipped = sorted({int(c["k"]) for c in walker_changes})
        x = "X̂ᶜ" if family == "qudit" else "X̂"
        what = f"{x} flips {_names(variant, flipped)}" if flipped else "its targets are empty"
        return (
            f"{head} on {where}: {ctrl_now} is {colour}{_branches(n_fired, n_branches)} → "
            f"{what}{rest(idle, always=False)}."
        )
    if kind in _COPY_KINDS:
        trigger = f"{ctrl_now} is red" if kind is not GateKind.COPY_CELL else "its switch F is on"
        if n_fired == 0:
            if kind is GateKind.COPY_CELL or (ideal and not frozen):
                return f"{head}: no memory lane where {trigger} → identity everywhere."
            idle = f"no red walker sits on the control site of {ctrl} in any memory lane"
            return f"{head}: {nowhere(idle, quantifier='')} → identity everywhere."
        result = _copy_result(reads, family, walker_changes, variant)
        tail = rest(f"no red walker on the control site of {ctrl}", always=False)
        return (
            f"{head} acts in the lane(s) where {trigger}{_branches(n_fired, n_branches)}: "
            f"the local copy {result}{tail}."
        )
    if kind in (GateKind.CELL_ON, GateKind.CELL_OFF):
        action = "on" if kind is GateKind.CELL_ON else "off"
        if n_fired == 0:
            if ideal and not frozen:
                return f"{head}: {ctrl} is {idle_ctrl} everywhere → no switch changes."
            idle = f"no red walker sits on the control site of {ctrl} in any memory lane"
            return f"{head}: {nowhere(idle, quantifier='')} → no switch changes."
        tail = rest(f"no red walker on the control site of {ctrl}", always=False)
        return (
            f"{head}: {ctrl_now} is red in the addressed lane(s){_branches(n_fired, n_branches)} "
            f"→ the cell switch F is turned {action}{tail}."
        )
    raise ValueError(kind)


def scatter_text(
    slot: Slot,
    direction: str,
    crossings: Sequence[Mapping[str, Any]],
    n_branches: int,
    branch_names: Mapping[int, str],
) -> str:
    """Sentence for one slot crossing bifurcations at one tick (all branches)."""

    def side(branch: int) -> str:
        return "left" if branch % 2 == 1 else "right"

    def one(c: Mapping[str, Any]) -> str:
        node = "({},{})".format(*c["node"])
        to = "({},{})".format(*c["to"])
        frm_s, to_s = str(c["from_s"]), str(c["to_s"])
        label = _COLOUR[frm_s] if frm_s in _COLOUR else _glyph(frm_s)
        if direction == "fwd":
            after = "stays red" if frm_s.endswith("R") else "reset to red"
            return f"{label} at node {node} → {side(c['to'][1])} into {to}, {after}"
        if direction == "bwd":
            frm = "({},{})".format(*c["from"])
            after = "stays red" if to_s.endswith("R") else "turns blue"
            return (
                f"arrives {label} from the {side(c['from'][1])} child {frm} → up into {to}, {after}"
            )
        return f"arrives {label} at node {node} → bounced into the sibling edge {to} (lost)"

    gate = "Ŝ" if direction == "fwd" else "Ŝ†"
    if n_branches == 1 or len(crossings) == 1:
        c = crossings[0]
        prefix = "" if n_branches == 1 else f" in branch {branch_names.get(c['b'], c['b'])}"
        return f"{gate}: {slot.label}{prefix} {one(c)}."
    if len(crossings) <= MAX_LISTED:
        parts = [f"{branch_names.get(c['b'], c['b'])}: {one(c)}" for c in crossings]
        return f"{gate}: {slot.label} — " + "; ".join(parts) + "."
    kinds = Counter(
        side(c["to"][1]) if direction == "fwd" else f"from the {side(c['from'][1])}"
        for c in crossings
    )
    summary = ", ".join(f"{cnt} {k}" for k, cnt in sorted(kinds.items()))
    return f"{gate}: {slot.label} crosses a bifurcation in {len(crossings)} branches ({summary})."


def inject_text(slot: Slot, n: int, n_branches: int) -> str:
    return (
        f"{slot.label} enters the tree at the input port (edge (1,1), site 1)"
        f"{_branches(n, n_branches)}."
    )


def exit_text(slot: Slot, n: int, n_branches: int) -> str:
    return f"{slot.label} leaves the tree through the port{_branches(n, n_branches)}."


# ---------------------------------------------------------------------------
# Noise (DECISIONS D21, D26, D27).

_OP_TEXT = {
    ("loss", 1): "lost (red walker → ∅)",
    ("loss", 2): "lost (blue walker → ∅)",
    ("bit_flip", 1): "colour flipped by X̂",
    ("scatter_flip", 1): "colour flipped right before the bifurcation: it takes the wrong branch",
    ("colour_dephasing", 1): "phase-flipped by Ẑ (|B⟩ gets a minus sign)",
    ("presence_dephasing", 1): "phase-flipped by Ẑ′ (the empty-slot component gets a minus sign)",
    ("logical_dephasing", 1): "phase-flipped by Ẑ′ (the empty-slot component gets a minus sign)",
    ("depolarizing", 1): "hit by an X̂ error",
    ("depolarizing", 2): "hit by a Ŷ error",
    ("depolarizing", 3): "hit by a Ẑ error",
}


def noise_text(
    channel: Any,
    op: int,
    slot: Slot,
    location: str,
    branches: Sequence[int],
    n_branches: int,
    branch_names: Mapping[int, str],
) -> str:
    labels = channel.labels
    what = (
        labels[op]
        if op < len(labels)
        else _OP_TEXT.get((channel.model, op), f"Kraus operator {op}")
    )
    where = {
        "propagation": "while moving",
        "gate": "after a gate",
        "memory": "at the memory cell",
        "scattering": "at a bifurcation",
        "idle": "while resting in the lane",
    }[location]
    head = f"Noise ({channel.model}, p = {channel.p:g}, {where}): {slot.label} {what}"
    if n_branches > 1 and branches:
        listed = ", ".join(branch_names.get(b, f"#{b}") for b in branches[:MAX_LISTED])
        more = "" if len(branches) <= MAX_LISTED else f" and {len(branches) - MAX_LISTED} more"
        head += f" in {listed}{more}"
    if channel.model == "loss":
        head += "; the jump also removes the branches where the slot was in another state"
    return head + "."


def gate_failure_text(gate: GateInstance, edges: Sequence[int]) -> str:
    where = ", ".join(f"({gate.level},{l})" for l in edges)
    return f"Gate failure: {gate.label} did not fire on {where} (it acted as the identity)."


def copy_error_text(gate: GateInstance, variant: Variant, lanes: Sequence[int]) -> str:
    cells = ", ".join(f"|{variant.geometry.address_of_cell(l)}⟩" for l in lanes)
    return f"Copy error: {gate.label} read the stored bit inverted in cell(s) {cells}."


def memory_flip_text(flips: Sequence[Mapping[str, Any]]) -> str:
    listed = ", ".join(f"b_{f['j']} of |{f['address']}⟩" for f in flips[:6])
    more = "" if len(flips) <= 6 else f" and {len(flips) - 6} more"
    return (
        f"Memory noise: {len(flips)} stored bit(s) flipped before the run ({listed}{more}); "
        "the copies read the flipped bits, the metrics compare with the intended memory."
    )


def stray_text(
    gate: GateInstance, variant: Variant, k_bin: int, pos: tuple[int, int, int], branch: str
) -> str:
    owner = variant.slots[k_bin].label if k_bin >= 0 else "no slot"
    return (
        f"Spurious walker: {gate.label} acted on the empty site {pos} in branch {branch}, where "
        f"no walker of the train sits, and created a red walker (|∅⟩ → |R⟩, technical paper, "
        f"Eq. (locCopy)). It shares the time bin of {owner}, which is elsewhere, so it is a "
        "stray."
    )


def collision_text(who: Sequence[str], pos: tuple[int, ...], branch: str) -> str:
    return (
        f"Collision: {who[0]} and {who[1]} occupy the same site {pos} in branch {branch}, outside "
        "the single-occupancy regime of the paper. The branch is frozen and counted as a "
        "failure."
    )


def absorb_text(slot: Slot, n: int, n_branches: int) -> str:
    return (
        f"{slot.label} ran past the end of its memory lane and left the system at the cell"
        f"{_branches(n, n_branches)}: the slot is now empty."
    )


def aux_left_text(slot: Slot, n: int, n_branches: int) -> str:
    return (
        f"{slot.label} is still on the auxiliary rail of the cell output circuit when the query "
        f"ends: it has no way back and leaves the system at the cell{_branches(n, n_branches)}."
    )


def overrotation_text(gate: GateInstance, new_branches: int) -> str:
    return (
        f"Coherent error: {gate.label} is over-rotated (X̂ → cos θ X̂ − i sin θ Î): every flipped "
        f"walker also keeps its colour with amplitude −i sin θ; {new_branches} new branch(es)."
    )


def imbalance_text(new_branches: int) -> str:
    return (
        "Coherent error: imbalanced bifurcation(s) — a crossing walker also leaves through the "
        f"other port with amplitude i sin φ; {new_branches} new branch(es)."
    )


def prune_text(
    count: int, weight: float, total: float, eps: float, *, capped: int = 0, cap: int = 0
) -> str:
    """``count`` branches dropped below ``eps``, ``capped`` beyond the ``cap`` largest."""
    dropped = []
    if count:
        dropped.append(f"{count} branch(es) below |α|² = {eps:g}")
    if capped:
        dropped.append(f"{capped} branch(es) beyond the {cap} largest (max_branches)")
    return (
        f"Pruning: {' and '.join(dropped) or 'branches'} dropped, weight {weight:.3g} "
        f"(total discarded so far {total:.3g}); fidelity and success are lower bounds."
    )


# ---------------------------------------------------------------------------
# Plain register (``text_plain``): the same facts as the sentences above, for readers who
# know qubits and gates but have not read the paper. No coordinates, no clock times; walker
# and gate names are kept as drawn on screen. ``ideal`` is false in runs with active noise:
# the sentences then drop the explanations that hold only for the ideal protocol (an
# absent address walker means bit 0, a red walker will take the left branch …).


_PLAIN_COLOUR = {"R": "red", "B": "blue"}
_PLAIN_VALUE = {"o": "○ (0)", "f": "● (1)"}
_PLAIN_TREE = {"u": " on the ↑ tree", "d": " on the ↓ tree", "x": " on the side rail"}


def _plain_colour(s: str) -> str:
    return _PLAIN_COLOUR.get(s[-1:], "empty")


def _plain_state(s: str) -> str:
    """``red``, ``○ blue``, ``red on the ↑ tree`` or ``empty``."""
    if s == "E":
        return "empty"
    colour, prefix = _plain_colour(s), s[:-1]
    if prefix in _PLAIN_VALUE:
        return f"{_PLAIN_VALUE[prefix][0]} {colour}"
    return colour + _PLAIN_TREE.get(prefix, "")


def _on(s: str) -> str:
    """Where a walker is, beyond its colour: `` on the ↑ tree``, `` as ●`` or ''."""
    prefix = s[:-1]
    if prefix in _PLAIN_VALUE:
        return f" as {_PLAIN_VALUE[prefix][0]}"
    return _PLAIN_TREE.get(prefix, "")


def _join(items: Sequence[str]) -> str:
    """``A``, ``A and B``, ``A, B and C``; long lists are shortened to ``A, B, …, Z``."""
    if len(items) > 4:
        return f"{items[0]}, {items[1]}, …, {items[-1]}"
    if len(items) <= 1:
        return "".join(items)
    return ", ".join(items[:-1]) + " and " + items[-1]


def _in(bids: Sequence[int], n_branches: int, names: Mapping[int, str]) -> str:
    """``every branch``, ``branch |11⟩``, ``3 of 8 branches`` ('' with a single branch)."""
    if n_branches <= 1:
        return ""
    unique = sorted(set(bids))
    if len(unique) >= n_branches:
        return "every branch"
    if len(unique) <= MAX_LISTED:
        listed = [names.get(b, f"#{b}") for b in unique]
        return ("branch " if len(listed) == 1 else "branches ") + _join(listed)
    return f"{len(unique)} of {n_branches} branches"


def _suffix(bids: Sequence[int], n_branches: int, names: Mapping[int, str]) -> str:
    where = _in(bids, n_branches, names)
    return f" in {where}" if where else ""


def _child(l: int) -> str:
    return "the left branch (bit 0)" if l % 2 == 1 else "the right branch (bit 1)"


def _cells(addresses: Sequence[str]) -> str:
    if len(addresses) == 1:
        return f"cell {addresses[0]}"
    if len(addresses) <= MAX_LISTED:
        return "cells " + _join(list(addresses))
    return f"{len(addresses)} cells"


def phase_plain(phase: str, variant: Variant, *, ideal: bool = True) -> str:
    """Plain sentence for the start of a phase (and for the end of the run)."""
    name = variant.name
    if phase == "routing":
        head = "Routing begins: the train enters the tree one step per clock cycle"
        rest = {
            "backup": (
                ". Each address bit is copied onto a backup walker and passed down the train "
                "two walkers at a time, steering the data walkers to the memory cell of the "
                "address."
            ),
            "qudit_short": (
                ". Every walker is a qudit with a value (○ = 0, ● = 1) and a colour; each "
                "address bit is passed down the train one walker at a time, steering the data "
                "to the addressed cell."
            ),
            "qudit_long": (
                ". Every walker is a qudit with a value (○ = 0, ● = 1) and a colour; each "
                "address walker recolours the walkers behind it that share its value, steering "
                "the data to the addressed cell."
            ),
            "dualrail_basic": (
                ". Every walker travels on one of two trees, ↑ (bit 0) or ↓ (bit 1); on each "
                "tree the address walkers steer the data walkers to the addressed cell."
            ),
            "dualrail_backup": (
                ". Every walker travels on one of two trees, ↑ (bit 0) or ↓ (bit 1), with "
                "backups on both; the address bits pass down the train two walkers at a time."
            ),
        }.get(
            name,
            ", and the address walkers steer the data walkers down to the memory cell of the "
            "address.",
        )
        return head + rest
    if phase == "query":
        family = _family(variant)
        first = "it" if _is_backup(variant) else "the data walker"
        effect = {
            "qudit": f"a 1 leaves {first} at ● (1), a 0 flips it to ○ (0)",
            "dualrail": (
                f"a 1 keeps {first} red on the ↓ tree, a 0 turns it blue and the output circuit "
                "moves it to the ↑ tree"
            ),
        }.get(family, f"a 1 leaves {first} red, a 0 removes it")
        if _is_backup(variant):
            how = (
                "Each data walker's copy is controlled by the backup ahead of it, which is red "
                f"only where the train arrived: a stored {effect.removeprefix('a ')}."
            )
        elif variant.copy_mode == "cell_switch":
            delimiter = variant.slots[-1].label
            how = (
                f"The flag D₀ switches its cell on, the copy reads each stored bit ({effect}), "
                f"and {delimiter} switches the cell off."
            )
        else:
            how = f"Where the flag D₀ arrived, the copy reads each stored bit: {effect}."
        return f"Query: the walkers rest in the memory cells. {how}"
    if phase == "inverse":
        return (
            "Inverse routing: the routing now runs backwards in time. The paths merge back at "
            "every bifurcation, the same gates fire again in reverse order, and the walkers "
            "head back out of the tree the way they came in."
        )
    if phase == "done":
        if ideal:
            return (
                "Done: every walker is back out of the tree, carrying the address and the bit "
                "it read."
            )
        return "Done: the run is over and the output state is read."
    raise ValueError(phase)


def turn_plain(variant: Variant) -> str:
    return (
        "End of the query: every walker turns around, and the routing is replayed backwards "
        "in time."
    )


def gate_plain(
    gate: GateInstance,
    variant: Variant,
    fired_in: Sequence[int],
    n_branches: int,
    branch_names: Mapping[int, str],
    changes: Sequence[Mapping[str, Any]],
    *,
    reads: Sequence[CopyRead] = (),
    lanes: Sequence[int] = (),
    controls: Sequence[str] = (),
    ideal: bool = True,
    frozen: int = 0,
    failed: int = 0,
) -> str:
    """Plain sentence for one gate instance firing at one tick.

    ``reads`` lists what a copy gate did (one record per branch and data walker), ``lanes``
    the memory cells where a cell switch fired, ``controls`` the walkers that activated the
    gate, ``frozen`` the branches stopped by a collision (no gate acts there) and ``failed``
    the edges or cells where a gate failure stopped it. With ``ideal`` false (noise has
    acted) the sentence keeps to what the engine saw, without the ideal-protocol reasons."""
    kind = gate.kind
    ctrl = _ctrl_label(gate, variant)
    place, expected = _control_place(gate, variant)
    # the walker that activated the gate, when it is not the one the protocol expects there
    if controls and set(controls) <= expected:
        ctrl_now = _join_or(controls)
    elif controls:
        who = _join_or(["a stray walker" if c == "stray" else c for c in controls])
        ctrl_now = f"the walker in {place}'s place ({who})"
    else:
        ctrl_now = ctrl
    flips = kind in (GateKind.U, GateKind.U_IN, GateKind.U_B)
    back = "On the way back " if gate.phase is Phase.INVERSE else ""
    if not fired_in and failed:
        lead = "the copy" if kind in _COPY_KINDS else gate.label
        lead = back + lead if back else lead[:1].upper() + lead[1:]
        return f"{lead} does nothing: it failed to fire."
    if not fired_in and not flips and frozen >= n_branches > 0:
        lead = "The copy" if kind in _COPY_KINDS else gate.label
        stopped = "its branch was" if n_branches == 1 else "every branch was"
        return f"{lead} does nothing: {stopped} stopped by a collision."
    if kind in (GateKind.OUT_S, GateKind.OUT_SDAG, GateKind.X_C):
        return _output_plain(gate, n_branches, branch_names, changes, variant)
    if kind in (GateKind.U, GateKind.U_IN, GateKind.U_B):
        return _flip_plain(
            gate,
            variant,
            fired_in,
            n_branches,
            branch_names,
            changes,
            ctrl_now,
            place,
            len(expected) > 1,
            ideal,
            frozen,
            failed,
        )
    if kind in _COPY_KINDS:
        return _copy_plain(
            gate, variant, fired_in, n_branches, branch_names, reads, ctrl_now, ideal
        )
    if kind in (GateKind.CELL_ON, GateKind.CELL_OFF):
        action = "on" if kind is GateKind.CELL_ON else "off"
        if not fired_in:
            why = (
                f"{ctrl} is not red in any memory cell"
                if ideal
                else f"no red walker is in {ctrl}'s place in any memory cell"
            )
            return f"{gate.label} does nothing: {why}, so no cell is switched {action}."
        cells = _cells([variant.geometry.address_of_cell(l) for l in lanes])
        again = " again" if kind is GateKind.CELL_OFF else ""
        return f"{gate.label}: {ctrl_now} is red, so it switches {cells} {action}{again}."
    raise ValueError(kind)


def _flip_plain(
    gate: GateInstance,
    variant: Variant,
    fired_in: Sequence[int],
    n_branches: int,
    branch_names: Mapping[int, str],
    changes: Sequence[Mapping[str, Any]],
    ctrl_now: str,
    place: str,
    pair: bool,
    ideal: bool,
    frozen: int,
    failed: int,
) -> str:
    """Û⁽ᵈ⁾, Û_in, Û_B: colour flips controlled by a walker.

    ``place`` names the control position (``Ã₂`` for the dual-rail pair ``Ã₂↑``/``Ã₂↓``,
    flagged by ``pair``)."""
    kind, label = gate.kind, gate.label
    family = _family(variant)
    inverse = gate.phase is Phase.INVERSE
    ctrl = _ctrl_label(gate, variant)
    is_active, active_walker = _active(kind, family)
    bit_note = family == "bosonic" and ideal and kind is not GateKind.U_B
    # why the gate does nothing where it does nothing
    if not ideal:
        idle = f"no {active_walker} is in {place}'s place"
    elif pair:
        idle = f"neither {place}↑ nor {place}↓ is blue"
    elif kind is GateKind.U_B:
        idle = f"{ctrl} is not blue"
    elif family == "qudit" and kind is GateKind.U_IN:
        idle = f"{ctrl} carries a 0 (○)"
    elif bit_note:
        idle = f"{ctrl} is absent (address bit 0)"
    else:
        idle = f"{ctrl} is not red"
    if not fired_in:
        lead = f"On the way back {label} again does nothing" if inverse else f"{label} does nothing"
        if frozen >= n_branches:
            stopped = "its branch was" if n_branches == 1 else "every branch was"
            return f"{lead}: {stopped} stopped by a collision."
        if frozen:
            return (
                f"{lead}: {idle} in the branches still running; the others were stopped by a "
                "collision."
            )
        if n_branches > 1:
            idle += " in any branch" if not ideal else " in every branch"
        so = ""
        if ideal and kind is GateKind.U and not inverse and family == "bosonic":
            so = ", so the walkers behind it stay red and will take the left branch"
        elif ideal and kind is GateKind.U_IN:
            behind = "the walker behind it" if family == "qudit" else "its backup"
            so = f", so {behind} keeps its colour"
        elif kind is GateKind.U_B:
            so = ", so no bit is passed on"
        return f"{lead}: {idle}{so}."
    if inverse:
        lead = f"On the way back {label} acts again"
    elif kind is GateKind.U:
        lead = f"{label} acts"
    elif kind is GateKind.U_IN and family == "qudit":
        lead = f"{label} starts passing the bit of {ctrl} down the train"
    elif kind is GateKind.U_IN:
        lead = f"{label} copies {ctrl} onto its backup" + (
            " on the same tree" if family == "dualrail" else ""
        )
    else:
        lead = f"{label} passes the bit down the train"
    lead += _suffix(fired_in, n_branches, branch_names)
    reason = f"{ctrl_now} {is_active}" + (" (address bit 1)" if bit_note else "")
    flips: dict[int, list[int]] = {b: [] for b in fired_in}
    colours: set[str] = set()
    for c in changes:
        if c.get("ghost"):
            continue
        flips.setdefault(int(c["b"]), []).append(int(c["k"]))
        colours.add(str(c["to"])[-1:])
    if not colours:
        return f"{lead}: {reason}, but it finds no walker to recolour."
    if colours == {"B"}:
        one, many = "turns blue", "turn blue"
    elif colours == {"R"}:
        one, many = ("turns red again", "turn red again") if inverse else ("turns red", "turn red")
    else:
        one, many = "changes colour", "change colour"
    groups: dict[tuple[int, ...], list[int]] = {}
    for b, ks in flips.items():
        groups.setdefault(tuple(sorted(set(ks))), []).append(b)
    union = [variant.slots[k].label for k in sorted({k for ks in flips.values() for k in ks})]

    def names(ks: tuple[int, ...]) -> str:
        return _join([variant.slots[k].label for k in ks]) or "none"

    selective = kind is GateKind.U and family in ("qudit", "dualrail")
    if selective:
        subject = (
            "the walkers behind it that share its value (○ or ●)"
            if family == "qudit"
            else "the walkers behind it on its own tree"
        )
        if len(groups) == 1:
            detail = f": {_join(union)}"
        elif len(groups) == 2:
            detail = ": " + "; ".join(
                f"{names(ks)} in {_in(bs, n_branches, branch_names)}" for ks, bs in groups.items()
            )
        else:
            detail = f" ({_join(union)})"
        effect = f"{subject} {many}{detail}"
    else:
        effect = f"{_join(union)} {one if len(union) == 1 else many}"
        if len(groups) > 1:  # not the same walkers in every branch
            effect += " where present" if family == "bosonic" else " in some of these branches"
        steers = family == "bosonic" or variant.name == "qudit_short"
        if ideal and not inverse and steers and colours == {"B"}:
            effect += " and will take the right branch"
    text = f"{lead}: {reason}, so {effect}."
    n_idle = n_branches - len(fired_in)
    if n_branches > 1 and n_idle > 0:
        other = "the other branch" if n_idle == 1 else f"the other {n_idle} branches"
        reasons = [f"no {active_walker} in {place}'s place" if not ideal else idle]
        if failed:
            reasons.append("the gate failed")
        if frozen:
            reasons.append("stopped by a collision")
        if len(reasons) > 1:
            text += f" In {other} nothing changes ({', or '.join(reasons)})."
        else:
            text += f" In {other} {idle}: nothing changes."
    return text


def _change(before: str, after: str) -> str:
    """How a copy changed a walker: ``stays red``, ``is removed``, ``flips from ● (1) …``."""
    if after == "E":
        return "is removed"
    if before == after:
        if before[:-1] in _PLAIN_VALUE:
            return f"stays {_PLAIN_VALUE[before[:-1]]}"
        return f"stays {_plain_state(before)}"
    if before[:-1] != after[:-1]:
        if before[:-1] in _PLAIN_VALUE and after[:-1] in _PLAIN_VALUE:
            return f"flips from {_PLAIN_VALUE[before[:-1]]} to {_PLAIN_VALUE[after[:-1]]}"
        return f"becomes {_plain_state(after)}"
    return f"turns {_plain_colour(after)}"


def _read_effect(r: CopyRead) -> tuple[str, bool]:
    """(effect, whether a walker was there): ``D₁ stays red``, ``D₁ is not there, …``."""
    if r.walker is None:
        if r.after == "E":
            return f"{r.target} is not there, so nothing happens", False
        return f"{r.target} is not there, so a new {_plain_state(r.after)} walker appears", False
    who = "a stray walker" if r.walker == "stray" else r.walker
    return f"{who} {_change(r.before, r.after)}", True


def _copy_plain(
    gate: GateInstance,
    variant: Variant,
    fired_in: Sequence[int],
    n_branches: int,
    branch_names: Mapping[int, str],
    reads: Sequence[CopyRead],
    ctrl_now: str,
    ideal: bool,
) -> str:
    kind = gate.kind
    ctrl = _ctrl_label(gate, variant)
    if not fired_in or not reads:
        if kind is GateKind.COPY_CELL:
            return "The copy does nothing: no memory cell is switched on."
        if not ideal:
            return f"The copy does nothing: no red walker is in {ctrl}'s place in any memory cell."
        return f"The copy does nothing: {ctrl} is not red in any memory cell."
    lead = (
        f"Controlled by {ctrl}, the copy reads"
        if kind is GateKind.COPY_BACKUP and ctrl_now == ctrl
        else "The copy reads"
    )
    unique = list(dict.fromkeys(r._replace(branch=-1) for r in reads))
    cells = list(dict.fromkeys(r.cell for r in unique))

    def held(r: CopyRead) -> str:
        return f"{r.stored}" if r.read == r.stored else f"{r.stored} but is read as {r.read}"

    if len(cells) == 1 and len(unique) == 1:
        r = unique[0]
        effect, present = _read_effect(r)
        return f"{lead} cell {r.cell}: its bit is {held(r)}, {'so' if present else 'but'} {effect}."
    if len(cells) == 1:
        parts = [f"{_read_effect(r)[0]} (stored {held(r)})" for r in unique]
        return f"{lead} cell {cells[0]}: " + "; ".join(parts) + "."
    if len(unique) == len(cells) == 2:
        parts = []
        for r in unique:
            effect, present = _read_effect(r)
            there = " there" if present else ""
            parts.append(
                f"cell {r.cell} holds {held(r)}, {'so' if present else 'but'} {effect}{there}"
            )
        return f"{lead} each addressed cell: " + "; ".join(parts) + "."
    outcomes: dict[tuple[int, str], set[int]] = {}
    for r in reads:
        outcomes.setdefault((r.read, _read_effect(r)[0]), set()).add(r.branch)
    ranked = sorted(outcomes.items(), key=lambda item: (-len(item[1]), item[0]))
    parts = []
    for i, ((bit, effect), bs) in enumerate(ranked[:2]):
        count = f"{len(bs)} branch{'' if len(bs) == 1 else 'es'}" if i == 0 else str(len(bs))
        parts.append(f"in {count} it reads {bit} and {effect}")
    if len(ranked) > 2:
        rest = len(set().union(*(bs for _, bs in ranked[2:])))
        parts.append(f"other outcomes in {rest} more")
    where = _in(fired_in, n_branches, branch_names) or "every branch"
    return f"{lead} the addressed cell in {where}: " + "; ".join(parts) + "."


def _output_plain(
    gate: GateInstance,
    n_branches: int,
    branch_names: Mapping[int, str],
    changes: Sequence[Mapping[str, Any]],
    variant: Variant,
) -> str:
    """Ŝ_M, Ŝ_M†, X̂_c: the output circuit of the dual-rail cells."""
    walker_changes = [c for c in changes if not c.get("ghost")]
    moved = sorted({int(c["k"]) for c in walker_changes})
    if not moved:
        return f"{gate.label}, part of the cells' output circuit, finds no walker to act on."
    names = _join([variant.slots[k].label for k in moved])
    one = len(moved) == 1
    it, s = ("it", "s") if one else ("they", "")
    where = _in([int(c["b"]) for c in walker_changes], n_branches, branch_names)
    pre = f"In {where}, " if where else ""
    if gate.kind is GateKind.OUT_S:
        return (
            f"{pre}{gate.label} moves {names} off the ↓ tree onto the cell's side rail, turning "
            f"{'it' if one else 'them'} red."
        )
    if gate.kind is GateKind.OUT_SDAG:
        return (
            f"{pre}{gate.label} moves {names} from the side rail onto the ↑ tree, where {it} "
            f"arrive{s} blue."
        )
    return f"{pre}{gate.label} turns {names} red again: on the ↑ tree {it} now encode{s} the bit 0."


def scatter_plain(
    slot: Slot,
    direction: str,
    crossings: Sequence[Mapping[str, Any]],
    n_branches: int,
    branch_names: Mapping[int, str],
) -> str:
    """Plain sentence for one walker crossing bifurcations at one tick (all branches)."""
    who = slot.label
    bids = [int(c["b"]) for c in crossings]
    where = _in(bids, n_branches, branch_names)
    if direction == "bounce":
        states = {str(c["from_s"]) for c in crossings}
        colour = f" {_plain_state(states.pop())}" if len(states) == 1 else ""
        pre = f"In {where}, on" if where else "On"
        return (
            f"{pre} the way back {who} arrives{colour} at a bifurcation, so Ŝ† bounces it into the "
            "sibling branch instead of sending it up: it is lost."
        )
    groups: dict[tuple[str, int, str], list[int]] = {}
    for c in crossings:
        child = int(c["to"][1]) if direction == "fwd" else int(c["from"][1])
        groups.setdefault((str(c["from_s"]), child % 2, str(c["to_s"])), []).append(int(c["b"]))
    if direction == "fwd":
        if len(groups) == 1:
            ((frm, child, _),) = groups
            reset = " and turns it red again" if frm.endswith("B") else ""
            pre = f"In {where}, " if where else ""
            return f"{pre}Ŝ sends {who}, {_plain_state(frm)}, into {_child(child)}{reset}."
        if len(groups) == 2:
            every = all(frm.endswith("B") for frm, _, _ in groups)
            parts = []
            for i, ((frm, child, _), bs) in enumerate(groups.items()):
                part = f"in {_in(bs, n_branches, branch_names)} {who if i == 0 else 'it'} is "
                part += _plain_state(frm)
                if frm.endswith("B") and not every:
                    part += f", goes into {_child(child)} and turns red again"
                else:
                    part += f" and goes into {_child(child)}"
                parts.append(part)
            tail = "; in both cases it turns red again" if every else ""
            return "Ŝ: " + "; ".join(parts) + tail + "."
        sides = Counter(_child(child) for (_, child, _), bs in groups.items() for _ in bs)
        summary = ", ".join(f"into {side} in {cnt}" for side, cnt in sorted(sides.items()))
        return f"Ŝ sends {who} across a bifurcation in {where}: {summary}."
    # backward: Ŝ† merges the two children into the parent edge
    if len(groups) == 1:
        ((frm, child, to),) = groups
        pre = f"In {where}, on" if where else "On"
        arriving = f"{who}, arriving {_plain_state(frm)} from {_child(child)}, back toward the root"
        if _plain_colour(to) == _plain_colour(frm):
            return f"{pre} the way back Ŝ† merges {arriving}; it stays {_plain_colour(to)}."
        tail = ": the routing is being undone" if to.endswith("B") else ""
        return f"{pre} the way back Ŝ† merges {arriving}, turning it {_plain_colour(to)}{tail}."
    if len(groups) == 2:
        # Walkers merge up only when red, so the colour they arrive with is left out here.
        afters = {
            key: (
                f"stays {_plain_colour(key[2])}"
                if _plain_colour(key[2]) == _plain_colour(key[0])
                else f"turns {_plain_colour(key[2])}"
            )
            for key in groups
        }
        uniform = len(set(afters.values())) == 1
        parts = []
        for i, (key, bs) in enumerate(groups.items()):
            frm, child, _ = key
            part = f"in {_in(bs, n_branches, branch_names)} {'it comes ' if i == 0 else ''}"
            part += f"from {_child(child)}{_on(frm)}"
            parts.append(part if uniform else f"{part} and {afters[key]}")
        head = f"On the way back Ŝ† merges {who} back toward the root"
        if uniform:
            after = next(iter(afters.values()))
            verb, colour = after.split()
            head += f", {'keeping' if verb == 'stays' else 'turning'} it {colour}"
        return f"{head}: " + "; ".join(parts) + "."
    outcomes = Counter(
        "stays red" if _plain_colour(to) == _plain_colour(frm) else f"turns {_plain_colour(to)}"
        for (frm, _, to), bs in groups.items()
        for _ in bs
    )
    summary = " and ".join(f"{what} in {cnt}" for what, cnt in sorted(outcomes.items()))
    return f"On the way back Ŝ† merges {who} back toward the root in {where}: it {summary}."


def inject_plain(
    slot: Slot, branches: Sequence[int], n_branches: int, branch_names: Mapping[int, str]
) -> str:
    return f"{slot.label} enters the tree{_suffix(branches, n_branches, branch_names)}."


def exit_plain(
    slot: Slot, branches: Sequence[int], n_branches: int, branch_names: Mapping[int, str]
) -> str:
    return f"{slot.label} leaves the tree{_suffix(branches, n_branches, branch_names)}."


def absorb_plain(
    slot: Slot, branches: Sequence[int], n_branches: int, branch_names: Mapping[int, str]
) -> str:
    return (
        f"{slot.label} runs past the end of its memory cell and leaves the system there"
        f"{_suffix(branches, n_branches, branch_names)}: it is now missing."
    )


def aux_left_plain(
    slot: Slot, branches: Sequence[int], n_branches: int, branch_names: Mapping[int, str]
) -> str:
    return (
        f"{slot.label} is still on the side rail of its cell's output circuit when the query "
        f"ends, so it cannot go back and is lost at the cell"
        f"{_suffix(branches, n_branches, branch_names)}."
    )


_PLAIN_WHERE = {
    "propagation": "while moving",
    "gate": "right after a gate",
    "memory": "at its memory cell",
    "scattering": "at a bifurcation",
    "idle": "while waiting at its memory cell",
}


def noise_plain(
    channel: Any,
    op: int,
    slot: Slot,
    location: str,
    branches: Sequence[int],
    n_branches: int,
    branch_names: Mapping[int, str],
) -> str:
    """Plain sentence for one quantum jump of a stochastic noise channel."""
    who = slot.label
    where = _PLAIN_WHERE[location]
    inb = _suffix(branches, n_branches, branch_names) if branches else ""
    labels: Sequence[str] = channel.labels
    label = labels[op] if op < len(labels) else ""
    bosonic = not labels
    model = str(channel.model)
    if model == "loss":
        colour = {1: ", red,", 2: ", blue,"}.get(op, "") if bosonic else ""
        return (
            f"Noise: {who}{colour} is lost {where}{inb} and disappears; the branches where it "
            "was in another state are dropped."
        )
    if model == "bit_flip":
        return f"Noise: the colour of {who} flips (red ↔ blue) {where}{inb}."
    if model == "scatter_flip":
        return (
            f"Noise: the colour of {who} flips just before a bifurcation{inb}, so it takes the "
            "wrong branch."
        )
    if model == "colour_dephasing":
        return (
            f"Noise: a phase error hits {who} {where}{inb}: the blue part of its state picks up "
            "a minus sign."
        )
    if model in ("presence_dephasing", "logical_dephasing"):
        part = next(
            (f"the {g} part of its state" for g in ("○", "↑") if g in label),
            "the part of its state where it is absent",
        )
        return f"Noise: a phase error hits {who} {where}{inb}: {part} picks up a minus sign."
    if model == "logical_flip":
        if "rail" in label:
            return f"Noise: {who} jumps to the other tree (↑ ↔ ↓) {where}{inb}."
        return f"Noise: the value of {who} flips (○ ↔ ●) {where}{inb}."
    if model == "depolarizing":
        if not bosonic:
            return f"Noise: a random depolarising error hits {who} {where}{inb}."
        effect = {
            1: "its colour flips (red ↔ blue)",
            2: "its colour flips and it picks up a phase",
            3: "the blue part of its state picks up a minus sign",
        }.get(op, "its state changes")
        return f"Noise: a depolarising error hits {who} {where}{inb}: {effect}."
    return f"Noise: {who} is hit by a {model.replace('_', ' ')} error {where}{inb}."


def _edges_plain(gate: GateInstance, variant: Variant, edges: Sequence[int]) -> str:
    """``in cell 10`` for memory gates, ``on one of the 2 edges of level 2`` in the tree."""
    if gate.level == variant.geometry.lane_level:
        return "in " + _cells([variant.geometry.address_of_cell(l) for l in edges])
    total = variant.geometry.n_edges(gate.level)
    if total == 1:
        return f"at level {gate.level}"
    if len(edges) >= total:
        return f"on any edge of level {gate.level}"
    count = "one" if len(edges) == 1 else str(len(edges))
    return f"on {count} of the {total} edges of level {gate.level}"


def gate_failure_plain(gate: GateInstance, variant: Variant, edges: Sequence[int]) -> str:
    return (
        f"Gate failure: {gate.label} did not fire {_edges_plain(gate, variant, edges)}, so it "
        "changed nothing there."
    )


def copy_error_plain(gate: GateInstance, variant: Variant, lanes: Sequence[int]) -> str:
    cells = _cells([variant.geometry.address_of_cell(l) for l in lanes])
    return f"Copy error: {gate.label} read the bit stored in {cells} the wrong way round."


def memory_flip_plain(flips: Sequence[Mapping[str, Any]]) -> str:
    listed = ", ".join(f"bit {f['j']} of cell {f['address']}" for f in flips[:MAX_LISTED])
    more = "" if len(flips) <= MAX_LISTED else f" and {len(flips) - MAX_LISTED} more"
    count = "one stored bit was" if len(flips) == 1 else f"{len(flips)} stored bits were"
    return (
        f"Memory noise: before the run {count} flipped ({listed}{more}); the copies read the "
        "flipped values, and the metrics compare with the intended memory."
    )


def stray_plain(gate: GateInstance, variant: Variant, k_bin: int, branch: str) -> str:
    if k_bin < 0:
        return (
            f"Spurious walker: {gate.label} acted on an empty spot in branch {branch} and created "
            "a red walker that belongs to no walker of the train: a stray."
        )
    owner = variant.slots[k_bin].label
    return (
        f"Spurious walker: {gate.label} found no walker where {owner} should be, in branch "
        f"{branch}, and created a red one: a stray, because {owner} is elsewhere."
    )


def collision_plain(who: Sequence[str], branch: str) -> str:
    a, b = ("a stray walker" if w == "stray" else w for w in who[:2])
    return (
        f"Collision: {a} and {b} land in the same place in branch {branch}, which the model "
        "does not describe; that branch is stopped and counted as a failure."
    )


def overrotation_plain(gate: GateInstance, new_branches: int) -> str:
    return (
        f"Coherent error: {gate.label} over-rotates, so every walker it flips also keeps its old "
        f"colour with a small amplitude; this adds {new_branches} new "
        f"branch{'' if new_branches == 1 else 'es'}."
    )


def imbalance_plain(new_branches: int) -> str:
    return (
        "Coherent error: unbalanced bifurcations, so a crossing walker also goes out the other "
        f"way with a small amplitude; this adds {new_branches} new "
        f"branch{'' if new_branches == 1 else 'es'}."
    )


def prune_plain(weight: float, total: float) -> str:
    return (
        f"Pruning: the smallest branches were dropped (weight {weight:.2g}, {total:.2g} so far), "
        "so fidelity and success are lower bounds."
    )
