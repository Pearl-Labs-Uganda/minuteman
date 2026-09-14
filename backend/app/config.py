"""
Environment-driven configuration for the Minuteman backend.

Everything the server can be tuned with lives here so the rest of the
package never has to reach for os.environ directly.
"""

from __future__ import annotations

import os
from pathlib import Path

# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

APP_DIR = Path(__file__).resolve().parent          # backend/app
BACKEND_DIR = APP_DIR.parent                       # backend
PROJECT_ROOT = BACKEND_DIR.parent                  # repo root

# The frontend is a Next.js app in ../frontend, normally served by its own
# dev server (`npm run dev` on :3000) or by `next start`. This backend only
# serves it when a static export exists at frontend/out — otherwise it runs
# API-only. Never point this at the Next source folder: that would expose
# source files instead of a built app.
FRONTEND_DIR = Path(
    os.environ.get("FRONTEND_DIR", PROJECT_ROOT / "frontend" / "out")
).resolve()

# Persistent data: the SQLite file and stored audio both live here.
DATA_DIR = Path(os.environ.get("DATA_DIR", PROJECT_ROOT / "data")).resolve()
DATA_DIR.mkdir(parents=True, exist_ok=True)

MEDIA_DIR = Path(os.environ.get("MEDIA_DIR", DATA_DIR / "media")).resolve()
MEDIA_DIR.mkdir(parents=True, exist_ok=True)

# Saved transcripts land at the repo root by default, next to both folders.
TRANSCRIPTS_DIR = Path(
    os.environ.get("TRANSCRIPTS_DIR", PROJECT_ROOT / "transcripts")
).resolve()
TRANSCRIPTS_DIR.mkdir(parents=True, exist_ok=True)


# --------------------------------------------------------------------------- #
# Upload / validation
# --------------------------------------------------------------------------- #

# Maximum accepted upload size. Override with MAX_UPLOAD_BYTES env var.
MAX_UPLOAD_BYTES = int(os.environ.get("MAX_UPLOAD_BYTES", str(500 * 1024 * 1024)))  # 500 MB

# Allowed audio/video file extensions.
ALLOWED_EXTENSIONS = {
    ".wav", ".mp3", ".m4a", ".mp4", ".webm",
    ".ogg", ".flac", ".aac", ".opus", ".aiff",
    ".aif", ".caf", ".wma",
}

# Allowed MIME-type prefixes (browser may send "audio/" or "video/" types).
ALLOWED_CONTENT_TYPE_PREFIXES = ("audio/", "video/")

# Class materials that can be attached to a lecture (slides, notes, scans).
ALLOWED_MATERIAL_EXTENSIONS = {
    ".pdf", ".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif",
    ".pptx", ".ppt", ".docx", ".doc",
}

# Materials are usually far smaller than recordings; cap them separately.
MAX_MATERIAL_BYTES = int(os.environ.get("MAX_MATERIAL_BYTES", str(100 * 1024 * 1024)))  # 100 MB

# Allowed Whisper model names — guards against arbitrary strings reaching load_model.
ALLOWED_MODELS = {"tiny", "base", "small", "medium", "large"}


# --------------------------------------------------------------------------- #
# Whisper
# --------------------------------------------------------------------------- #

# Model sizes (smaller = faster, larger = more accurate):
#   tiny, base, small, medium, large
# `base` is a good default for CPU. Override with the WHISPER_MODEL env var.
DEFAULT_MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")

# Device selection for Whisper inference.
#   WHISPER_DEVICE=auto   — use CUDA if available, then MPS, then CPU (default)
#   WHISPER_DEVICE=cuda   — force NVIDIA GPU
#   WHISPER_DEVICE=mps    — force Apple Silicon GPU
#   WHISPER_DEVICE=cpu    — force CPU (disables GPU even if present)
DEVICE_CONFIG = os.environ.get("WHISPER_DEVICE", "auto").lower()


# --------------------------------------------------------------------------- #
# Server / CORS
# --------------------------------------------------------------------------- #

HOST = os.environ.get("HOST", "127.0.0.1")
PORT = int(os.environ.get("PORT", "8000"))
RELOAD = os.environ.get("RELOAD", "").lower() in {"1", "true", "yes"}

# CORS: comma-separated list of allowed origins.
# The Next.js dev server runs on a different origin than this API, so the
# local dev ports are allowed by default — otherwise nothing works out of the
# box. Set CORS_ORIGINS explicitly to override (use "" to disable CORS
# entirely, e.g. when FastAPI serves a static export from the same origin).
DEFAULT_CORS_ORIGINS = "http://localhost:3000,http://127.0.0.1:3000"
_raw_cors = os.environ.get("CORS_ORIGINS", DEFAULT_CORS_ORIGINS)
CORS_ORIGINS: list[str] = [o.strip() for o in _raw_cors.split(",") if o.strip()]


# --------------------------------------------------------------------------- #
# Database
# --------------------------------------------------------------------------- #

# Swap for e.g. postgresql+psycopg://user:pass@host/db to move off SQLite.
DATABASE_URL = os.environ.get("DATABASE_URL", f"sqlite:///{DATA_DIR / 'minuteman.db'}")

# Set SQL_ECHO=1 to log every statement — noisy, useful when debugging queries.
SQL_ECHO = os.environ.get("SQL_ECHO", "").lower() in {"1", "true", "yes"}


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #

SESSION_COOKIE_NAME = "minuteman_session"

# How long a login stays valid.
SESSION_TTL_DAYS = int(os.environ.get("SESSION_TTL_DAYS", "30"))

# Minimum password length accepted at registration.
MIN_PASSWORD_LENGTH = int(os.environ.get("MIN_PASSWORD_LENGTH", "8"))

# Send the cookie only over HTTPS. Off by default because local development is
# plain HTTP; turn it on (COOKIE_SECURE=1) for any real deployment.
COOKIE_SECURE = os.environ.get("COOKIE_SECURE", "").lower() in {"1", "true", "yes"}

# Set REGISTRATION_OPEN=0 to stop new accounts being created once yours exists.
REGISTRATION_OPEN = os.environ.get("REGISTRATION_OPEN", "1").lower() in {"1", "true", "yes"}
