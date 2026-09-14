"""
Minuteman — local speech-to-text web app (backend).

A small FastAPI server that loads OpenAI's Whisper locally and exposes
endpoints to transcribe uploaded audio files, with accounts and a SQLite
database so sessions and transcripts persist and can be retrieved later.

The UI is a separate Next.js app in ../frontend with its own dev server, so
in development this process is API-only. It will additionally serve a static
export if one has been built to frontend/out.

Run from the repo root:
    python backend/run.py            # API on :8000
    cd frontend && npm run dev       # UI on :3000
"""

from __future__ import annotations

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles

from . import config
from .db import init_db
from .routers import audio, auth, lectures, materials, system


def create_app() -> FastAPI:
    app = FastAPI(title="Minuteman", version="0.1.0")

    init_db()

    if config.CORS_ORIGINS:
        app.add_middleware(
            CORSMiddleware,
            allow_origins=config.CORS_ORIGINS,
            # Login cookies must survive the hop from the Next dev server on
            # :3000 to this API on :8000, which requires credentials support
            # and an explicit (never wildcard) origin list.
            allow_credentials=True,
            # PUT is required for the audio upload; a missing verb here makes
            # the browser preflight fail with 400 while curl still works.
            allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
            allow_headers=["*"],
        )

    # API routes are registered before the static mount so they always win:
    # Starlette matches routes in registration order.
    app.include_router(system.router)
    app.include_router(auth.router)
    app.include_router(lectures.router)
    app.include_router(materials.router)
    app.include_router(audio.router)

    if config.FRONTEND_DIR.is_dir():
        # html=True serves index.html for "/" and for unknown paths.
        app.mount(
            "/",
            StaticFiles(directory=config.FRONTEND_DIR, html=True),
            name="frontend",
        )
    else:
        print(f"[minuteman] No static frontend build at {config.FRONTEND_DIR} — "
              f"running API-only. Start the Next.js app separately "
              f"(cd frontend && npm run dev).")

    return app


app = create_app()
