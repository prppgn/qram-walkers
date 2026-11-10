"""The desktop app (qramsim.desktop): server on a free port, self-test, browser mode, saving."""

from __future__ import annotations

import base64
import sys
import threading
import time
import types
from pathlib import Path

import httpx
import pytest

from qramsim import desktop
from qramsim.server import PageWatch

PAGE = '<!doctype html><html><body><div id="root"></div></body></html>'


@pytest.fixture
def static(tmp_path: Path) -> Path:
    (tmp_path / "index.html").write_text(PAGE, encoding="utf-8")
    return tmp_path


def wait_for(condition, timeout: float = 10.0) -> None:  # type: ignore[no-untyped-def]
    deadline = time.monotonic() + timeout
    while not condition():
        assert time.monotonic() < deadline, "timed out"
        time.sleep(0.02)


def test_the_page_watch_counts_open_pages() -> None:
    watch = PageWatch()
    assert not watch.seen and watch.open == 0
    watch.enter()
    watch.enter()
    assert watch.seen and watch.open == 2 and watch.idle_for() == 0.0
    watch.leave()
    assert watch.idle_for() == 0.0
    watch.leave()
    time.sleep(0.05)
    assert watch.open == 0 and watch.idle_for() >= 0.05


def test_self_test_serves_the_page_and_runs_e2_exactly(static: Path) -> None:
    server = desktop.Server(static)
    server.start()
    try:
        assert server.url.startswith("http://127.0.0.1:")
        report = desktop.self_test(server)
        assert "E2 fidelity 1.000000000000" in report
        # Without a page watch the server neither offers nor serves a session.
        health = httpx.get(server.url + "api/health").json()
        assert "session" not in health
    finally:
        server.stop()
    assert not server.thread.is_alive()


def test_the_browser_mode_stops_once_its_page_is_closed(
    static: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    watch = PageWatch()
    server = desktop.Server(static, watch)
    server.start()
    opened: list[str] = []
    monkeypatch.setattr(desktop.webbrowser, "open", opened.append)
    done = threading.Event()

    def run() -> None:
        desktop.run_browser(server, watch, grace=0.3, first=30)
        done.set()

    threading.Thread(target=run, daemon=True).start()
    wait_for(lambda: bool(opened))
    try:
        assert httpx.get(server.url + "api/health").json()["session"] == "hold"
        with httpx.stream("GET", server.url + "api/session", timeout=10) as reply:
            assert reply.headers["content-type"].startswith("text/event-stream")
            lines = reply.iter_lines()  # kept: dropping it would close the stream
            assert next(lines) == "retry: 2000"
            wait_for(lambda: watch.open == 1)
            time.sleep(0.6)
            assert not done.is_set(), "stopped while its page was open"
        wait_for(lambda: watch.open == 0)
        assert done.wait(10), "still running after its page was closed"
    finally:
        server.stop()


def test_the_browser_mode_gives_up_if_no_page_ever_opens(
    static: Path, monkeypatch: pytest.MonkeyPatch
) -> None:
    watch = PageWatch()
    server = desktop.Server(static, watch)
    server.start()
    monkeypatch.setattr(desktop.webbrowser, "open", lambda url: None)
    try:
        start = time.monotonic()
        desktop.run_browser(server, watch, grace=0.1, first=0.3)
        assert time.monotonic() - start < 5
    finally:
        server.stop()


class FakeWindow:
    def __init__(self, answer: object) -> None:
        self.answer = answer
        self.asked: dict[str, object] = {}

    def create_file_dialog(self, kind: object, **kwargs: object) -> object:
        self.asked = {"kind": kind, **kwargs}
        return self.answer


@pytest.fixture
def fake_webview(monkeypatch: pytest.MonkeyPatch) -> types.ModuleType:
    module = types.ModuleType("webview")
    module.FileDialog = types.SimpleNamespace(SAVE="save")  # type: ignore[attr-defined]
    monkeypatch.setitem(sys.modules, "webview", module)
    return module


@pytest.mark.parametrize("answer", ["{path}", ("{path}",)])
def test_saving_writes_the_chosen_file(
    tmp_path: Path, fake_webview: types.ModuleType, answer: object
) -> None:
    target = tmp_path / "frame.png"
    chosen = answer.format(path=target) if isinstance(answer, str) else (str(target),)
    api = desktop.DesktopApi()
    api._window = FakeWindow(chosen)
    data = bytes(range(256))
    assert api.save_file("../frame.png", base64.b64encode(data).decode()) == str(target)
    assert target.read_bytes() == data
    # The page proposes only a file name, never a folder.
    assert api._window.asked == {"kind": "save", "save_filename": "frame.png"}


def test_cancelling_the_dialog_saves_nothing(
    tmp_path: Path, fake_webview: types.ModuleType
) -> None:
    api = desktop.DesktopApi()
    api._window = FakeWindow(None)
    assert api.save_file("a.svg", base64.b64encode(b"<svg/>").decode()) is None
    assert list(tmp_path.iterdir()) == []


def test_the_page_does_not_see_the_window_object() -> None:
    public = [n for n in vars(desktop.DesktopApi()) if not n.startswith("_")]
    assert public == []


def test_a_missing_interface_is_an_error_not_a_crash(
    monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    monkeypatch.setattr(desktop, "bundled_viewer", lambda: None)
    assert desktop.main(["--self-test"]) == 1
    assert "built interface was not found" in capsys.readouterr().err


def test_the_cli_runs_the_desktop_self_test(
    static: Path, monkeypatch: pytest.MonkeyPatch, capsys: pytest.CaptureFixture[str]
) -> None:
    from qramsim.cli import main

    monkeypatch.setattr(desktop, "bundled_viewer", lambda: static)
    assert main(["desktop", "--self-test"]) == 0
    assert "E2 fidelity" in capsys.readouterr().out


def test_user_folders_follow_each_system(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(desktop.sys, "platform", "darwin")
    assert desktop.user_dir("logs").parts[-3:] == ("Library", "Logs", "qram-walkers")
    monkeypatch.setattr(desktop.sys, "platform", "linux")
    monkeypatch.setenv("XDG_STATE_HOME", "/state")
    assert desktop.user_dir("logs") == Path("/state/qram-walkers")
