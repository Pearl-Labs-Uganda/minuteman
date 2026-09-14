"""
The lecture recording: upload, transcribe, play back, remove.

One audio track per lecture — uploading a second replaces the first. Whisper
runs in a worker thread because it is blocking CPU/GPU work that would
otherwise stall every other request.
"""

from __future__ import annotations

from pathlib import Path

import anyio
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DbSession

from .. import config, schemas, security, whisper_service
from ..db import get_db
from ..models import AudioTrack, Message, Segment, User, utcnow
from ._common import audio_of, delete_stored_file, owned_lecture, store_upload

router = APIRouter(tags=["audio"])

_AUDIO_MEDIA_TYPES = {
    ".wav": "audio/wav", ".mp3": "audio/mpeg", ".m4a": "audio/mp4",
    ".mp4": "video/mp4", ".webm": "audio/webm", ".ogg": "audio/ogg",
    ".flac": "audio/flac", ".aac": "audio/aac", ".opus": "audio/opus",
    ".aiff": "audio/aiff", ".aif": "audio/aiff", ".caf": "audio/x-caf",
    ".wma": "audio/x-ms-wma",
}


def _validate(upload: UploadFile, model: str) -> str:
    if not upload.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")

    if model not in config.ALLOWED_MODELS:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid model '{model}'. "
                   f"Allowed: {', '.join(sorted(config.ALLOWED_MODELS))}.",
        )

    suffix = Path(upload.filename).suffix.lower() or ".wav"
    if suffix not in config.ALLOWED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported file type '{suffix}'. "
                   f"Allowed: {', '.join(sorted(config.ALLOWED_EXTENSIONS))}.",
        )

    content_type = (upload.content_type or "").split(";")[0].strip().lower()
    if content_type and not any(
        content_type.startswith(p) for p in config.ALLOWED_CONTENT_TYPE_PREFIXES
    ):
        raise HTTPException(
            status_code=415, detail=f"Unsupported content type '{content_type}'."
        )
    return suffix


@router.put("/lectures/{lecture_id}/audio", response_model=schemas.AudioOut)
async def set_audio(
    lecture_id: str,
    file: UploadFile = File(...),
    model: str = Form(default=config.DEFAULT_MODEL_NAME),
    language: str | None = Form(default=None),
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    """Attach a recording to a lecture and transcribe it. Replaces any existing."""
    lecture = owned_lecture(db, lecture_id, user)
    suffix = _validate(file, model)

    if lecture.audio is not None:
        delete_stored_file(lecture.audio.stored_path)
        db.delete(lecture.audio)
        db.flush()

    # The row exists before the slow part, so a crash still leaves a record.
    track = AudioTrack(
        lecture_id=lecture.id,
        name=file.filename,
        status="transcribing",
        model=model,
    )
    db.add(track)
    db.flush()

    rel_path = f"{user.id}/audio/{track.id}{suffix}"
    dest = config.MEDIA_DIR / rel_path

    try:
        track.size_bytes = await store_upload(file, dest, config.MAX_UPLOAD_BYTES)
        track.stored_path = rel_path
        db.commit()

        result = await anyio.to_thread.run_sync(
            lambda: whisper_service.transcribe_file(str(dest), model, language)
        )

        track.text = str(result.get("text") or "").strip()
        track.language = result.get("language")
        track.status = "done"

        raw_segments = result.get("segments") or []
        for idx, seg in enumerate(raw_segments):
            db.add(Segment(
                audio_id=track.id,
                idx=idx,
                start=float(seg.get("start") or 0.0),
                end=float(seg.get("end") or 0.0),
                text=str(seg.get("text") or "").strip(),
            ))
        if raw_segments:
            track.duration_sec = float(raw_segments[-1].get("end") or 0.0)

        db.add(Message(
            lecture_id=lecture.id,
            type="system",
            content=f"Transcribed {track.name} with {model}.",
        ))
        lecture.updated_at = utcnow()
        db.commit()

    except HTTPException:
        track.status = "error"
        track.error_msg = "Upload rejected."
        db.commit()
        raise
    except Exception as exc:  # noqa: BLE001
        track.status = "error"
        track.error_msg = str(exc)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Transcription failed: {exc}")

    db.refresh(track)
    return schemas.AudioOut.model_validate(track)


@router.get("/lectures/{lecture_id}/audio/file")
def get_audio_file(
    lecture_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    """Stream the stored recording back for playback."""
    lecture = owned_lecture(db, lecture_id, user)
    track = audio_of(db, lecture)
    if not track.stored_path:
        raise HTTPException(status_code=404, detail="No audio stored.")

    path = config.MEDIA_DIR / track.stored_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Audio file is missing from disk.")

    media_type = _AUDIO_MEDIA_TYPES.get(path.suffix.lower(), "application/octet-stream")
    return FileResponse(path, media_type=media_type)


@router.delete("/lectures/{lecture_id}/audio", status_code=204)
def delete_audio(
    lecture_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    lecture = owned_lecture(db, lecture_id, user)
    track = audio_of(db, lecture)
    delete_stored_file(track.stored_path)
    db.delete(track)
    lecture.updated_at = utcnow()
    db.commit()
