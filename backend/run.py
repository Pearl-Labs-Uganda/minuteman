#!/usr/bin/env python3
"""
Development entrypoint for the Minuteman backend.

    python backend/run.py

Honours HOST, PORT and RELOAD from the environment (see app/config.py).
For production, run uvicorn (or gunicorn) against `app.main:app` directly.
"""

from __future__ import annotations

import sys
from pathlib import Path

# Allow `python backend/run.py` from any working directory.
sys.path.insert(0, str(Path(__file__).resolve().parent))

from app import config  # noqa: E402


def main() -> None:
    import uvicorn

    print(f"[minuteman] Serving on http://{config.HOST}:{config.PORT}")
    uvicorn.run(
        "app.main:app",
        host=config.HOST,
        port=config.PORT,
        reload=config.RELOAD,
        # Watch only the backend package — the default (cwd) would also walk
        # .venv/ and transcripts/ for no benefit.
        reload_dirs=[str(config.BACKEND_DIR)] if config.RELOAD else None,
    )


if __name__ == "__main__":
    main()
