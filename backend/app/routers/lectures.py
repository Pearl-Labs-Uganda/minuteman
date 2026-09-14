"""Lectures — the rail on the left, and everything hanging off one lecture."""

from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session as DbSession

from .. import schemas, security
from ..db import get_db
from ..models import AudioTrack, Lecture, Material, Message, User, utcnow
from ._common import delete_stored_file, owned_lecture, to_lecture_detail

router = APIRouter(prefix="/lectures", tags=["lectures"])


@router.get("", response_model=list[schemas.LectureSummary])
def list_lectures(
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    """Newest-first list for the rail, with counts but no transcript bodies."""
    rows = db.execute(
        select(
            Lecture,
            func.count(Material.id.distinct()),
            func.count(AudioTrack.id.distinct()),
        )
        .outerjoin(Material, Material.lecture_id == Lecture.id)
        .outerjoin(AudioTrack, AudioTrack.lecture_id == Lecture.id)
        .where(Lecture.user_id == user.id)
        .group_by(Lecture.id)
        .order_by(Lecture.updated_at.desc())
    ).all()

    out = []
    for lecture, material_count, audio_count in rows:
        summary = schemas.LectureSummary.model_validate(lecture)
        summary.material_count = material_count
        summary.has_audio = audio_count > 0
        out.append(summary)
    return out


@router.post("", response_model=schemas.LectureDetail, status_code=201)
def create_lecture(
    payload: schemas.LectureCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    lecture = Lecture(
        user_id=user.id,
        title=payload.title.strip() or "Untitled lecture",
    )
    db.add(lecture)
    db.flush()
    db.add(Message(
        lecture_id=lecture.id,
        type="system",
        content="New lecture. Add a recording and its slides (PDF, images, "
                "PowerPoint, or Word) from the left.",
    ))
    db.commit()
    db.refresh(lecture)
    return to_lecture_detail(lecture)


@router.get("/{lecture_id}", response_model=schemas.LectureDetail)
def get_lecture(
    lecture_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    """Everything needed to restore a lecture: materials, transcript, chat."""
    return to_lecture_detail(owned_lecture(db, lecture_id, user))


@router.patch("/{lecture_id}", response_model=schemas.LectureSummary)
def update_lecture(
    lecture_id: str,
    payload: schemas.LectureUpdate,
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    """Rename, or persist which material/page the reader is on."""
    lecture = owned_lecture(db, lecture_id, user)

    if payload.title is not None:
        lecture.title = payload.title.strip() or "Untitled lecture"
    if payload.active_material_id is not None:
        lecture.active_material_id = payload.active_material_id or None
    if payload.active_page is not None:
        lecture.active_page = payload.active_page

    lecture.updated_at = utcnow()
    db.commit()
    return schemas.LectureSummary.model_validate(lecture)


@router.delete("/{lecture_id}", status_code=204)
def delete_lecture(
    lecture_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    """Deletes the lecture, its rows, and every file it stored."""
    lecture = owned_lecture(db, lecture_id, user)
    for material in lecture.materials:
        delete_stored_file(material.stored_path)
    if lecture.audio is not None:
        delete_stored_file(lecture.audio.stored_path)
    db.delete(lecture)
    db.commit()


@router.post("/{lecture_id}/messages", response_model=schemas.MessageOut, status_code=201)
def add_message(
    lecture_id: str,
    payload: schemas.MessageCreate,
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    lecture = owned_lecture(db, lecture_id, user)
    message = Message(
        lecture_id=lecture.id,
        type=payload.type,
        content=payload.content,
        tone=payload.tone,
    )
    db.add(message)
    lecture.updated_at = utcnow()
    db.commit()
    return schemas.MessageOut.model_validate(message)
