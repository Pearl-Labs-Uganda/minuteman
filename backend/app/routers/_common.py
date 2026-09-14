"""Shared helpers for the lecture routers: ownership checks and file storage."""

from __future__ import annotations

from pathlib import Path

from fastapi import HTTPException, UploadFile
from sqlalchemy.orm import Session as DbSession

from .. import config, schemas
from ..models import AudioTrack, Lecture, Material, User


def owned_lecture(db: DbSession, lecture_id: str, user: User) -> Lecture:
    """Fetch a lecture only if it belongs to the caller, else 404.

    Returning 404 rather than 403 keeps another user's ids unguessable.
    """
    lecture = db.get(Lecture, lecture_id)
    if lecture is None or lecture.user_id != user.id:
        raise HTTPException(status_code=404, detail="Lecture not found.")
    return lecture


def owned_material(db: DbSession, material_id: str, user: User) -> Material:
    material = (
        db.query(Material)
        .join(Lecture, Material.lecture_id == Lecture.id)
        .filter(Material.id == material_id, Lecture.user_id == user.id)
        .first()
    )
    if material is None:
        raise HTTPException(status_code=404, detail="Material not found.")
    return material


def delete_stored_file(rel_path: str | None) -> None:
    """Remove a stored file, ignoring one that is already gone."""
    if not rel_path:
        return
    try:
        (config.MEDIA_DIR / rel_path).unlink(missing_ok=True)
    except OSError:
        pass


async def store_upload(audio: UploadFile, dest: Path, max_bytes: int) -> int:
    """Stream an upload to dest, enforcing a size cap. Returns bytes written."""
    dest.parent.mkdir(parents=True, exist_ok=True)
    total = 0
    with dest.open("wb") as fh:
        while True:
            chunk = await audio.read(1024 * 1024)
            if not chunk:
                break
            total += len(chunk)
            if total > max_bytes:
                fh.close()
                dest.unlink(missing_ok=True)
                raise HTTPException(
                    status_code=413,
                    detail=f"File too large. Maximum allowed size is "
                           f"{max_bytes // (1024 * 1024)} MB.",
                )
            fh.write(chunk)
    return total


def to_lecture_detail(lecture: Lecture) -> schemas.LectureDetail:
    """Full hydration of a lecture, including transcript segments."""
    detail = schemas.LectureDetail.model_validate(lecture)
    if lecture.audio is not None:
        detail.audio = schemas.AudioOut.model_validate(lecture.audio)
    return detail


def audio_of(db: DbSession, lecture: Lecture) -> AudioTrack:
    if lecture.audio is None:
        raise HTTPException(status_code=404, detail="This lecture has no audio.")
    return lecture.audio
