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
import shutil
import tempfile
import uuid
from datetime import datetime
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, File, Form, HTTPException, UploadFile
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
# Whisper model — loaded lazily so the server starts fast
# --------------------------------------------------------------------------- #

# Model sizes (smaller = faster, larger = more accurate):
#   tiny, base, small, medium, large
# `base` is a good default for CPU. Override with the WHISPER_MODEL env var.
DEFAULT_MODEL_NAME = os.environ.get("WHISPER_MODEL", "base")

_model = None
_model_name_loaded: Optional[str] = None


def get_model(model_name: str | None = None):
    """Load (or reuse) the Whisper model. Imported lazily to keep startup snappy."""
    global _model, _model_name_loaded

    import whisper  # imported here so the server boots even if whisper is slow to import

    name = model_name or DEFAULT_MODEL_NAME
    if _model is None or _model_name_loaded != name:
        print(f"[minuteman] Loading Whisper model '{name}' (first call may take a while)...")
        _model = whisper.load_model(name)
        _model_name_loaded = name
        print(f"[minuteman] Model '{name}' ready.")
    return _model


# --------------------------------------------------------------------------- #
# FastAPI app
# --------------------------------------------------------------------------- #

app = FastAPI(title="Minuteman", version="0.1.0")


@app.get("/")
def index():
    """Serve the single-page frontend."""
    return FileResponse(STATIC_DIR / "index.html")


@app.get("/health")
def health():
    return {"ok": True, "model": _model_name_loaded or f"(not loaded; default={DEFAULT_MODEL_NAME})"}


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

    suffix = Path(audio.filename).suffix or ".wav"

    # Write the upload to a temp file so whisper / ffmpeg can read from disk.
    with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
        shutil.copyfileobj(audio.file, tmp)
        tmp_path = Path(tmp.name)

    try:
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
    except Exception as exc:  # noqa: BLE001
        return JSONResponse(
            status_code=500,
            content={"ok": False, "error": str(exc)},
        )
    finally:
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
        host="127.0.0.1",
        port=8000,
        reload=False,
    )
