"""What the public repository may contain.

No journal name for the unpublished technical paper, and none of the authors' working notes
(they live in a git-ignored `internal/` folder of the authors' checkouts).
"""

from __future__ import annotations

import re
import subprocess
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parents[2]
# Spelled in two pieces so that this file does not match itself.
JOURNAL = re.compile(rb"\b" + b"P" + b"RA" + rb"\b")
INTERNAL = ["PROTOCOL", "DESIGN", "PLAN", "DECISIONS", "STATUS", "RELEASE_CHECKLIST"]
# Pointers at the working notes, or at their numbered decisions.
POINTER = re.compile(rb"(" + "|".join(INTERNAL).encode() + rb"|CLAUDE)\.md|DECISIONS? D\d")
# What users read. CONTRIBUTING.md is left out: it says that code comments cite the notes.
READ_BY_USERS = (
    "README.md",
    "INSTALL.md",
    "CITATION.cff",
    "docs/user-guide/",
    "engine/README.md",
    "viewer/README.md",
)


def tracked() -> list[str]:
    try:
        out = subprocess.run(
            ["git", "ls-files", "-z"], cwd=ROOT, capture_output=True, check=True
        ).stdout
    except (OSError, subprocess.CalledProcessError):
        pytest.skip("not a git checkout")
    return [p for p in out.decode().split("\0") if p]


def hits(pattern: re.Pattern[bytes], paths: list[str]) -> list[str]:
    found = []
    for rel in paths:
        path = ROOT / rel
        if not path.is_file():
            continue
        for i, line in enumerate(path.read_bytes().splitlines(), 1):
            if pattern.search(line):
                found.append(f"{rel}:{i}")
    return found


def test_the_technical_paper_is_not_named_by_a_journal() -> None:
    assert not hits(JOURNAL, tracked()), "cite it as 'the technical paper' (see the README)"


def test_the_working_notes_are_not_published() -> None:
    notes = {f"{d}/{n}.md" for d in ("docs", "internal") for n in INTERNAL} | {"CLAUDE.md"}
    published = set(tracked())
    assert not notes & published
    assert not [p for p in published if p.startswith((".claude/", "internal/", "paper/"))]


def test_what_users_read_does_not_point_at_the_working_notes() -> None:
    files = [p for p in tracked() if p.startswith(READ_BY_USERS)]
    assert len(files) > 5
    assert not hits(POINTER, files)
