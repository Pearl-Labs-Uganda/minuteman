"""
Minuteman — local speech-to-text web app.

A small FastAPI server that loads OpenAI's Whisper locally and exposes
a simple endpoint to transcribe uploaded audio files.

Run:
    pip install -r requirements.txt
    # Make sure ffmpeg is installed on your system (brew install ffmpeg)
    python app.py
Then open http://127.0.0.1:8000 in your browser.
"""

from __future__ import annotations

import os
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles


# --------------------------------------------------------------------------- #
# Paths
# --------------------------------------------------------------------------- #

APP_DIR = Path(__file__).resolve().parent
STATIC_DIR = APP_DIR / "static"
TRANSCRIPTS_DIR = APP_DIR / "transcripts"
TRANSCRIPTS_DIR.mkdir(exist_ok=True)


# --------------------------------------------------------------------------- #
# Upload / validation config
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

# Allowed Whisper model names — guards against arbitrary strings reaching load_model.
ALLOWED_MODELS = {"tiny", "base", "small", "medium", "large"}

# CORS: comma-separated list of allowed origins, e.g.
#   CORS_ORIGINS=https://app.example.com,https://staging.example.com
# Leave empty (default) to allow no cross-origin requests.
_raw_cors = os.environ.get("CORS_ORIGINS", "")
CORS_ORIGINS: list[str] = [o.strip() for o in _raw_cors.split(",") if o.strip()]

# --------------------------------------------------------------------------- #
# Whisper model — loaded lazily so the server starts fast
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
_DEVICE_ENV = os.environ.get("WHISPER_DEVICE", "auto").lower()


def _resolve_device() -> str:
    """Resolve the compute device to pass to whisper.load_model()."""
    if _DEVICE_ENV != "auto":
        return _DEVICE_ENV  # explicit override — trust the operator
    try:
        import torch
        if torch.cuda.is_available():
            return "cuda"
        if torch.backends.mps.is_available():
            return "mps"
    except Exception:  # torch not importable (shouldn't happen, whisper depends on it)
        pass
    return "cpu"


COMPUTE_DEVICE: str = _resolve_device()

_model = None
_model_name_loaded: Optional[str] = None


def get_model(model_name: str | None = None):
    """Load (or reuse) the Whisper model. Imported lazily to keep startup snappy."""
    global _model, _model_name_loaded

    import whisper  # imported here so the server boots even if whisper is slow to import

    name = model_name or DEFAULT_MODEL_NAME
    if _model is None or _model_name_loaded != name:
        print(f"[minuteman] Loading Whisper model '{name}' on device '{COMPUTE_DEVICE}' "
              f"(first call may take a while)...")
        _model = whisper.load_model(name, device=COMPUTE_DEVICE)
        _model_name_loaded = name
        print(f"[minuteman] Model '{name}' ready on '{COMPUTE_DEVICE}'.")
    return _model


# --------------------------------------------------------------------------- #
# FastAPI app
# --------------------------------------------------------------------------- #

app = FastAPI(title="Minuteman", version="0.1.0")

if CORS_ORIGINS:
    app.add_middleware(
        CORSMiddleware,
        allow_origins=CORS_ORIGINS,
        allow_methods=["GET", "POST"],
        allow_headers=["*"],
    )


@app.get("/")
def index():
    """Serve the single-page frontend."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health():
    return {
        "ok": True,
        "model": _model_name_loaded or f"(not loaded; default={DEFAULT_MODEL_NAME})",
        "device": COMPUTE_DEVICE,
        "device_config": _DEVICE_ENV,
    }


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    model: str = Form(default=DEFAULT_MODEL_NAME),
    language: Optional[str] = Form(default=None),
):
    """
    Accept an audio file and return its raw transcription.

    Form fields:
        audio:    the uploaded audio file (wav, m4a, mp3, ...).
        model:    optional whisper model name (tiny|base|small|medium|large).
        language: optional ISO language code (e.g. "en"). Whisper auto-detects if omitted.
    """
    if audio.filename is None:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    # --- Validate model name (prevents arbitrary strings reaching whisper.load_model) ---
    if model not in ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model '{model}'. Allowed: {', '.join(sorted(ALLOWED_MODELS))}.",
        )

    # --- Validate file extension ---
    suffix = Path(audio.filename).suffix.lower() or ".wav"
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{suffix}'. "
                   f"Allowed: {', '.join(sorted(ALLOWED_EXTENSIONS))}.",
        )

    # --- Validate MIME type (when the browser provides one) ---
    content_type = (audio.content_type or "").split(";")[0].strip().lower()
    if content_type and not any(content_type.startswith(p) for p in ALLOWED_CONTENT_TYPE_PREFIXES):
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported content type '{content_type}'.",
        )

    # --- Stream to a temp file, enforcing the size cap ---
    tmp_path: Optional[Path] = None
    try:
        tmp_fd, tmp_name = tempfile.mkstemp(suffix=suffix)
        tmp_path = Path(tmp_name)
        total_bytes = 0
        with os.fdopen(tmp_fd, "wb") as tmp_fh:
            while True:
                chunk = await audio.read(1024 * 1024)  # read 1 MB at a time
                if not chunk:
                    break
                total_bytes += len(chunk)
                if total_bytes > MAX_UPLOAD_BYTES:
                    raise HTTPException(
                        status_code=413,
                        detail=f"File too large. Maximum allowed size is "
                               f"{MAX_UPLOAD_BYTES // (1024 * 1024)} MB.",
                    )
                tmp_fh.write(chunk)

        whisper_model = get_model(model)
        kwargs: dict = {}
        if language:
            kwargs["language"] = language

        result = whisper_model.transcribe(str(tmp_path), **kwargs)
        text = str(result.get("text") or "").strip()
        detected_language = result.get("language")
        segments = [
            {
                "start": seg.get("start"),
                "end": seg.get("end"),
                "text": str(seg.get("text") or "").strip(),
            }
            for seg in result.get("segments", [])
        ]

        # Persist the raw transcript to disk so the user has a copy.
        transcript_id = f"{datetime.now():%Y%m%d-%H%M%S}-{uuid.uuid4().hex[:6]}"
        out_path = TRANSCRIPTS_DIR / f"{transcript_id}.txt"
        out_path.write_text(text, encoding="utf-8")

        return JSONResponse(
            {
                "ok": True,
                "transcript_id": transcript_id,
                "text": text,
                "language": detected_language,
                "model": model,
                "segments": segments,
                "saved_to": str(out_path.relative_to(APP_DIR)),
                "source_filename": audio.filename,
            }
        )
    except HTTPException:
        raise
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": str(exc)},
        )
    finally:
        if tmp_path is not None:
            try:
                tmp_path.unlink(missing_ok=True)
            except Exception:
                pass


# --------------------------------------------------------------------------- #
# Placeholder endpoints for the polish step (we'll wire these up next)
# --------------------------------------------------------------------------- #

@app.post("/cleanup")
async def cleanup(text: str = Form(...)):
    """Polish a raw transcript (placeholder — to be implemented)."""
    return JSONResponse(
        status_code=501,
        content={
            "ok": False,
            "error": "Cleanup step not implemented yet. Add an LLM provider (Claude/OpenAI/Ollama) and wire it up here.",
        },
    )


@app.post("/minutes")
async def minutes(text: str = Form(...)):
    """Generate meeting minutes from a transcript (placeholder)."""
    return JSONResponse(
        status_code=501,
        content={
            "ok": False,
            "error": "Minutes generation not implemented yet.",
        },
    )


@app.post("/summary")
async def summary(text: str = Form(...)):
    """Generate a summary report from a transcript (placeholder)."""
    return JSONResponse(
        status_code=501,
        content={
            "ok": False,
            "error": "Summary generation not implemented yet.",
        },
    )


# Mount static last so it doesn't shadow the explicit routes above.
app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")


# --------------------------------------------------------------------------- #
# Entrypoint
# --------------------------------------------------------------------------- #

if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "app:app",
        host=os.environ.get("HOST", "0.0.0.0"),
        port=int(os.environ.get("PORT", "8000")),
        reload=False,
    )
