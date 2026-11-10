"""Golden ket sequences of the arXiv appendix examples (PROTOCOL.md §6 E1, E2).

The expected kets are transcribed by hand from the appendix (tail → front, superscript
``(d,l)``, primes in the inverse phase), with the flag walker ``D_0`` included from the
start (the appendix adds it before the query).
"""

from __future__ import annotations

from qramsim.kets import SnapshotRecorder, ket_branch, paper_checkpoints
from qramsim.presets import get_preset
from qramsim.simulator import Simulator


def sequence(preset: str) -> dict[str, list[str]]:
    sim = Simulator(get_preset(preset).config)
    snaps = SnapshotRecorder()
    sim.run([snaps])
    return {
        cp.name: [ket_branch(b, sim.variant.slots) for b in cp.branches]
        for cp in paper_checkpoints(sim, snaps)
    }


E1 = {
    "ψ_in": ["|R^{1,1}⟩_{D1} |R^{1,1}⟩_{D0} |∅^{1}⟩_{A2} |R^{1,1}⟩_{A1}"],
    "ψ_1": ["|B^{1,1}⟩_{D1} |B^{1,1}⟩_{D0} |∅^{1}⟩_{A2} |R^{1,1}⟩_{A1}"],
    "ψ_2": ["|R^{2,2}⟩_{D1} |R^{2,2}⟩_{D0} |∅^{2}⟩_{A2} |R^{2,1}⟩_{A1}"],
    "ψ_3": ["|R^{2,2}⟩_{D1} |R^{2,2}⟩_{D0} |∅^{2}⟩_{A2} |R^{2,1}⟩_{A1}"],
    "ψ_4": ["|R^{3,3}⟩_{D1} |R^{3,3}⟩_{D0} |∅^{3}⟩_{A2} |R^{3,1}⟩_{A1}"],
    "ψ_Q": ["|R^{3',3}⟩_{D1} |R^{3',3}⟩_{D0} |∅^{3'}⟩_{A2} |R^{3',1}⟩_{A1}"],
    "ψ_5": ["|R^{2',2}⟩_{D1} |R^{2',2}⟩_{D0} |∅^{2'}⟩_{A2} |R^{2',1}⟩_{A1}"],
    "ψ_6": ["|R^{2',2}⟩_{D1} |R^{2',2}⟩_{D0} |∅^{2'}⟩_{A2} |R^{2',1}⟩_{A1}"],
    "ψ_7": ["|B^{1',1}⟩_{D1} |B^{1',1}⟩_{D0} |∅^{1'}⟩_{A2} |R^{1',1}⟩_{A1}"],
    "ψ_out": ["|R^{1',1}⟩_{D1} |R^{1',1}⟩_{D0} |∅^{1'}⟩_{A2} |R^{1',1}⟩_{A1}"],
    "output": ["|R^{out}⟩_{D1} |R^{out}⟩_{D0} |∅^{out}⟩_{A2} |R^{out}⟩_{A1}"],
}

E2 = {
    "ψ_in": [
        "|R^{1,1}⟩_{D1} |R^{1,1}⟩_{D0} |∅^{1}⟩_{A2} |∅^{1}⟩_{A1}",
        "|R^{1,1}⟩_{D1} |R^{1,1}⟩_{D0} |R^{1,1}⟩_{A2} |R^{1,1}⟩_{A1}",
    ],
    "ψ_1": [
        "|R^{1,1}⟩_{D1} |R^{1,1}⟩_{D0} |∅^{1}⟩_{A2} |∅^{1}⟩_{A1}",
        "|B^{1,1}⟩_{D1} |B^{1,1}⟩_{D0} |B^{1,1}⟩_{A2} |R^{1,1}⟩_{A1}",
    ],
    "ψ_2": [
        "|R^{2,1}⟩_{D1} |R^{2,1}⟩_{D0} |∅^{2}⟩_{A2} |∅^{2}⟩_{A1}",
        "|R^{2,2}⟩_{D1} |R^{2,2}⟩_{D0} |R^{2,2}⟩_{A2} |R^{2,1}⟩_{A1}",
    ],
    "ψ_3": [
        "|R^{2,1}⟩_{D1} |R^{2,1}⟩_{D0} |∅^{2}⟩_{A2} |∅^{2}⟩_{A1}",
        "|B^{2,2}⟩_{D1} |B^{2,2}⟩_{D0} |R^{2,2}⟩_{A2} |R^{2,1}⟩_{A1}",
    ],
    "ψ_4": [
        "|R^{3,1}⟩_{D1} |R^{3,1}⟩_{D0} |∅^{3}⟩_{A2} |∅^{3}⟩_{A1}",
        "|R^{3,4}⟩_{D1} |R^{3,4}⟩_{D0} |R^{3,3}⟩_{A2} |R^{3,1}⟩_{A1}",
    ],
    "ψ_Q": [
        "|R^{3',1}⟩_{D1} |R^{3',1}⟩_{D0} |∅^{3'}⟩_{A2} |∅^{3'}⟩_{A1}",
        "|∅^{3'}⟩_{D1} |R^{3',4}⟩_{D0} |R^{3',3}⟩_{A2} |R^{3',1}⟩_{A1}",
    ],
    "ψ_5": [
        "|R^{2',1}⟩_{D1} |R^{2',1}⟩_{D0} |∅^{2'}⟩_{A2} |∅^{2'}⟩_{A1}",
        "|∅^{2'}⟩_{D1} |B^{2',2}⟩_{D0} |R^{2',2}⟩_{A2} |R^{2',1}⟩_{A1}",
    ],
    "ψ_6": [
        "|R^{2',1}⟩_{D1} |R^{2',1}⟩_{D0} |∅^{2'}⟩_{A2} |∅^{2'}⟩_{A1}",
        "|∅^{2'}⟩_{D1} |R^{2',2}⟩_{D0} |R^{2',2}⟩_{A2} |R^{2',1}⟩_{A1}",
    ],
    "ψ_7": [
        "|R^{1',1}⟩_{D1} |R^{1',1}⟩_{D0} |∅^{1'}⟩_{A2} |∅^{1'}⟩_{A1}",
        "|∅^{1'}⟩_{D1} |B^{1',1}⟩_{D0} |B^{1',1}⟩_{A2} |R^{1',1}⟩_{A1}",
    ],
    "ψ_out": [
        "|R^{1',1}⟩_{D1} |R^{1',1}⟩_{D0} |∅^{1'}⟩_{A2} |∅^{1'}⟩_{A1}",
        "|∅^{1'}⟩_{D1} |R^{1',1}⟩_{D0} |R^{1',1}⟩_{A2} |R^{1',1}⟩_{A1}",
    ],
    "output": [
        "|R^{out}⟩_{D1} |R^{out}⟩_{D0} |∅^{out}⟩_{A2} |∅^{out}⟩_{A1}",
        "|∅^{out}⟩_{D1} |R^{out}⟩_{D0} |R^{out}⟩_{A2} |R^{out}⟩_{A1}",
    ],
}


def test_e1_ket_sequence() -> None:
    assert sequence("E1") == E1


def test_e1_with_stored_zero_erases_d1() -> None:
    seq = sequence("E1b")
    assert seq["ψ_Q"] == ["|∅^{3'}⟩_{D1} |R^{3',3}⟩_{D0} |∅^{3'}⟩_{A2} |R^{3',1}⟩_{A1}"]
    assert seq["output"] == ["|∅^{out}⟩_{D1} |R^{out}⟩_{D0} |∅^{out}⟩_{A2} |R^{out}⟩_{A1}"]


def test_e2_ket_sequence() -> None:
    assert sequence("E2") == E2


def test_cli_prints_e1(capsys) -> None:  # type: ignore[no-untyped-def]
    from qramsim.cli import main

    assert main(["run", "--preset", "E1", "--print-kets", "--no-color", "--quiet"]) == 0
    out = capsys.readouterr().out
    for name, kets in E1.items():
        assert name in out
        for ket in kets:
            assert ket in out
