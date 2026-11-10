"""English narration of engine events (DESIGN.md §3.5, DECISION D8).

Every event recorded in a trajectory carries a sentence generated here, so the CLI and
the viewer share the wording. Sentences use the paper's notation (Û⁽ᵈ⁾, Ŝ, Ŝ†, |R⟩,
|B⟩, ∅, (d,l)). When many branches are involved the text summarises; the structured
event fields keep every detail.
"""

from __future__ import annotations

from collections import Counter
from collections.abc import Mapping, Sequence
from typing import TYPE_CHECKING, Any

from .gates import GateKind
from .schedule import GateInstance, Phase, Schedule
from .train import Slot

if TYPE_CHECKING:
    from .variants import Variant

MAX_LISTED = 3
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


def gate_text(
    gate: GateInstance,
    variant: Variant,
    fired_in: Sequence[int],
    n_branches: int,
    branch_names: Mapping[int, str],
    changes: Sequence[Mapping[str, Any]],
) -> str:
    """Sentence for one gate instance firing at one tick."""
    inverse = gate.phase is Phase.INVERSE
    head = f"{gate.label}" + (" (inverse routing; self-adjoint)" if inverse else "")
    ctrl = variant.slots[gate.control_slot].label if gate.control_slot is not None else None
    n_fired = len(fired_in)
    walker_changes = [c for c in changes if not c.get("ghost")]
    family = _family(variant)
    idle_ctrl = "absent (∅)" if family == "bosonic" else "not in an activating state"
    if gate.kind in (GateKind.OUT_S, GateKind.OUT_SDAG, GateKind.X_C):
        moved = sorted({int(c["k"]) for c in walker_changes})
        what = {
            GateKind.OUT_S: "sends the blue data walkers of the ↓ lane to the auxiliary rail, red",
            GateKind.OUT_SDAG: "merges the auxiliary rail into the ↑ lane: the walkers arrive blue",
            GateKind.X_C: "resets the data walkers on the ↑ lane to red (clocked colour NOT)",
        }[gate.kind]
        if not moved:
            return f"{head} (output circuit of every cell) acts on no walker: nothing to move."
        return (
            f"{head} (output circuit of the cells) {what}: "
            f"{_names(variant, moved)}{_branches(n_fired, n_branches)}."
        )
    if gate.kind is GateKind.U:
        n_edges = variant.geometry.n_edges(gate.level)
        where = (
            f"edge ({gate.level},1)"
            if n_edges == 1
            else f"the {n_edges} edges ({gate.level},·) of level {gate.level}"
        )
        if n_fired == 0:
            return (
                f"{head} fires on {where}: the control {ctrl} is {idle_ctrl} in every branch "
                "→ identity."
            )
        flipped = sorted({int(c["k"]) for c in walker_changes})
        x = {"qudit": "X̂ᶜ'⁰ / X̂ᶜ'¹", "dualrail": "X̂ (on the tree of the control)"}.get(family, "X̂")
        what = f"{x} flips {_names(variant, flipped)}" if flipped else "no walker sits behind it"
        if family == "qudit":
            what += " (a red ○ control flips the ○ walkers, a red ● control the ● walkers)"
        if n_branches == 1:
            return f"{head} fires on {where}: {ctrl} is red → {what}."
        listed = ", ".join(branch_names.get(b, f"#{b}") for b in fired_in[:MAX_LISTED])
        more = "" if n_fired <= MAX_LISTED else f" and {n_fired - MAX_LISTED} more"
        rest = (
            f"; in the other {n_branches - n_fired} branch(es) {ctrl} is {idle_ctrl} → identity"
            if n_fired < n_branches
            else ""
        )
        return (
            f"{head} fires on {where}: {ctrl} is red in {n_fired} of {n_branches} branches "
            f"({listed}{more}) → {what} there{rest}."
        )
    if gate.kind in (GateKind.U_IN, GateKind.U_B):
        n_edges = variant.geometry.n_edges(gate.level)
        where = (
            f"edge ({gate.level},1)"
            if n_edges == 1
            else f"the {n_edges} edges of level {gate.level}"
        )
        colour = "red" if gate.kind is GateKind.U_IN else "blue"
        if family == "qudit" and gate.kind is GateKind.U_IN:
            colour = "a 1 (●)"
        if n_fired == 0:
            if gate.kind is GateKind.U_IN:
                idle = {"qudit": "a 0 (○)", "bosonic": "absent (∅)"}.get(family, idle_ctrl)
            else:
                idle = "red or absent" if family == "bosonic" else "red"
            return f"{head} on {where}: the control {ctrl} is {idle} everywhere → identity."
        flipped = sorted({int(c["k"]) for c in walker_changes})
        x = "X̂ᶜ" if family == "qudit" else "X̂"
        what = f"{x} flips {_names(variant, flipped)}" if flipped else "its targets are empty"
        return f"{head} on {where}: {ctrl} is {colour}{_branches(n_fired, n_branches)} → {what}."
    if gate.kind in (GateKind.COPY_GLOBAL, GateKind.COPY_CELL, GateKind.COPY_BACKUP):
        trigger = f"{ctrl} is red" if gate.kind is not GateKind.COPY_CELL else "its switch F is on"
        if n_fired == 0:
            return f"{head}: no memory lane where {trigger} → identity everywhere."
        verb, kept = {
            "qudit": ("flips to ○R", "leaves the data walkers in ●R (stored bits = 1)"),
            "dualrail": ("turns blue", "leaves the data walkers red (stored bits = 1)"),
        }.get(family, ("erases", "leaves the data walkers red (stored bits = 1)"))
        touched = Counter(variant.slots[int(c["k"])].label for c in walker_changes)
        result = (
            f"{verb} " + ", ".join(f"{name} in {cnt} branch(es)" for name, cnt in touched.items())
            if touched
            else kept
        )
        return (
            f"{head} acts in the lane(s) where {trigger}{_branches(n_fired, n_branches)}: "
            f"the local copy {result}."
        )
    if gate.kind in (GateKind.CELL_ON, GateKind.CELL_OFF):
        action = "on" if gate.kind is GateKind.CELL_ON else "off"
        if n_fired == 0:
            return f"{head}: {ctrl} is {idle_ctrl} everywhere → no switch changes."
        return (
            f"{head}: {ctrl} is red in the addressed lane(s){_branches(n_fired, n_branches)} "
            f"→ the cell switch F is turned {action}."
        )
    raise ValueError(gate.kind)


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


def prune_text(count: int, weight: float, total: float, eps: float) -> str:
    return (
        f"Pruning: {count} branch(es) below |α|² = {eps:g} dropped, weight {weight:.3g} "
        f"(total discarded so far {total:.3g}); fidelity and success are lower bounds."
    )
