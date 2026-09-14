"""
Whisper model management.

The model is loaded lazily on the first transcription so the server boots
fast, then cached in-process and reused until a different model is asked for.
"""

from __future__ import annotations

import threading
from typing import Any, Optional

from . import config


def _resolve_device() -> str:
    """Resolve the compute device to pass to whisper.load_model()."""
    if config.DEVICE_CONFIG != "auto":
        return config.DEVICE_CONFIG  # explicit override — trust the operator
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

# Transcription runs in a worker thread, so two requests can arrive at once.
# This serialises both loading and inference: Whisper models are not safe to
# call concurrently, and without it a second request could swap the model out
# from under the first.
_lock = threading.Lock()


def loaded_model_name() -> Optional[str]:
    """Name of the model currently held in memory, or None if none is loaded."""
    return _model_name_loaded


def get_model(model_name: str | None = None):
    """
    Load (or reuse) the Whisper model. Imported lazily to keep startup snappy.

    Callers must hold _lock, or use transcribe_file() which does it for them.
    """
    global _model, _model_name_loaded

    import whisper  # imported here so the server boots even if whisper is slow to import

    name = model_name or config.DEFAULT_MODEL_NAME
    if _model is None or _model_name_loaded != name:
        print(f"[minuteman] Loading Whisper model '{name}' on device '{COMPUTE_DEVICE}' "
              f"(first call may take a while)...")
        _model = whisper.load_model(name, device=COMPUTE_DEVICE)
        _model_name_loaded = name
        print(f"[minuteman] Model '{name}' ready on '{COMPUTE_DEVICE}'.")
    return _model


def transcribe_file(
    path: str,
    model_name: str | None = None,
    language: str | None = None,
) -> dict[str, Any]:
    """
    Transcribe an audio file. Blocking — call it from a worker thread.

    Holds the model lock for the whole call so a concurrent request cannot
    replace the model mid-inference.
    """
    with _lock:
        model = get_model(model_name)
        kwargs: dict[str, Any] = {}
        if language:
            kwargs["language"] = language
        return model.transcribe(path, **kwargs)
