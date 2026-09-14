"""Health check and the not-yet-implemented LLM endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, Form
from fastapi.responses import JSONResponse

from .. import config, security, whisper_service
from ..models import User

router = APIRouter(tags=["system"])


@router.get("/health")
def health():
    return {
        "ok": True,
        "model": whisper_service.loaded_model_name()
                 or f"(not loaded; default={config.DEFAULT_MODEL_NAME})",
        "device": whisper_service.COMPUTE_DEVICE,
        "device_config": config.DEVICE_CONFIG,
        "registration_open": config.REGISTRATION_OPEN,
    }


# --------------------------------------------------------------------------- #
# Placeholders for the polish step (we'll wire these up next)
# --------------------------------------------------------------------------- #

def _not_implemented(what: str) -> JSONResponse:
    return JSONResponse(
        status_code=501,
        content={
            "ok": False,
            "error": f"{what} not implemented yet. Add an LLM provider "
                     f"(Claude/OpenAI/Ollama) and wire it up here.",
        },
    )


@router.post("/cleanup")
async def cleanup(
    text: str = Form(...),
    user: User = Depends(security.get_current_user),
):
    """Polish a raw transcript (placeholder — to be implemented)."""
    return _not_implemented("Cleanup")


@router.post("/minutes")
async def minutes(
    text: str = Form(...),
    user: User = Depends(security.get_current_user),
):
    """Generate meeting minutes from a transcript (placeholder)."""
    return _not_implemented("Minutes generation")


@router.post("/summary")
async def summary(
    text: str = Form(...),
    user: User = Depends(security.get_current_user),
):
    """Generate a summary report from a transcript (placeholder)."""
    return _not_implemented("Summary generation")
