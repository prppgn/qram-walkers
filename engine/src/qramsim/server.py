"""HTTP API for the viewer (DESIGN.md §3.7), a thin door to :mod:`qramsim.webapi`.

``POST /api/simulate`` (``RunConfig`` JSON → trajectory JSON), ``GET /api/presets``,
``GET /api/schema``, ``GET /api/health``, ``POST /api/ensemble`` (``{config, runs,
seed0}`` → mean, std and standard error of the metrics over ``runs`` noisy trajectories).
When a built viewer is available its files are served at ``/``. With a :class:`PageWatch`,
``GET /api/session`` is a stream that each open page holds, so that the desktop app opened in
a browser knows when its page has been closed.
"""

from __future__ import annotations

import asyncio
import json
import threading
import time
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from fastapi import Body, FastAPI, HTTPException, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import Response, StreamingResponse
from fastapi.staticfiles import StaticFiles

from . import __version__, webapi
from .schemas import RUN_JSON_SCHEMA, TRAJ_JSON_SCHEMA

DEV_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
# Seconds between two keep-alive comments of the session stream.
SESSION_PING = 15.0


class PageWatch:
    """How many pages hold ``/api/session`` open, and since when none does."""

    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._open = 0
        self._since = time.monotonic()
        self.seen = False

    def enter(self) -> None:
        with self._lock:
            self._open += 1
            self.seen = True

    def leave(self) -> None:
        with self._lock:
            self._open -= 1
            if self._open == 0:
                self._since = time.monotonic()

    @property
    def open(self) -> int:
        with self._lock:
            return self._open

    def idle_for(self) -> float:
        """Seconds since the last page was closed (or since the start); 0 while one is open."""
        with self._lock:
            return 0.0 if self._open else time.monotonic() - self._since

    def state(self) -> tuple[bool, float]:
        """Whether a page was ever open, and :meth:`idle_for`, read together."""
        with self._lock:
            return self.seen, 0.0 if self._open else time.monotonic() - self._since


def create_app(static_dir: Path | None = None, watch: PageWatch | None = None) -> FastAPI:
    app = FastAPI(title="qramsim", version=__version__)
    app.add_middleware(GZipMiddleware, minimum_size=2048)
    app.add_middleware(
        CORSMiddleware, allow_origins=DEV_ORIGINS, allow_methods=["*"], allow_headers=["*"]
    )

    @app.get("/api/health")
    def health() -> dict[str, str]:
        reply = webapi.health()
        if watch is not None:
            reply["session"] = "hold"
        return reply

    if watch is not None:

        @app.get("/api/session")
        async def session(request: Request) -> StreamingResponse:
            async def stream() -> AsyncIterator[str]:
                watch.enter()
                try:
                    yield "retry: 2000\n\n"
                    # Wait for the page to go away; a comment now and then keeps the line open.
                    while True:
                        try:
                            message = await asyncio.wait_for(request.receive(), SESSION_PING)
                        except TimeoutError:
                            yield ": open\n\n"
                            continue
                        if message["type"] == "http.disconnect":
                            return
                finally:
                    watch.leave()

            return StreamingResponse(stream(), media_type="text/event-stream")

    @app.get("/api/presets")
    def presets() -> list[dict[str, Any]]:
        return webapi.presets()

    @app.get("/api/schema")
    def schema() -> dict[str, Any]:
        return webapi.schema()

    @app.post("/api/simulate")
    def simulate_endpoint(body: dict[str, Any] = Body(...)) -> Response:  # noqa: B008
        try:
            text = webapi.simulate_json(body)
        except webapi.REQUEST_ERRORS as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        return Response(content=text, media_type="application/json")

    @app.post("/api/ensemble")
    def ensemble(body: dict[str, Any] = Body(...)) -> dict[str, Any]:  # noqa: B008
        try:
            return webapi.ensemble(body)
        except webapi.REQUEST_ERRORS as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc

    if static_dir is not None and (static_dir / "index.html").exists():
        app.mount("/", StaticFiles(directory=static_dir, html=True), name="viewer")
    return app


def default_static_dir() -> Path | None:
    """``viewer/dist`` of a source checkout, if built."""
    here = Path(__file__).resolve()
    for parent in here.parents:
        candidate = parent / "viewer" / "dist"
        if candidate.is_dir():
            return candidate
    return None


def dump_schemas() -> str:
    return json.dumps({"run": RUN_JSON_SCHEMA, "traj": TRAJ_JSON_SCHEMA}, indent=2)
