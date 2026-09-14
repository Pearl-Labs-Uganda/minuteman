"""Class materials — upload, download for preview, delete."""

from __future__ import annotations

import mimetypes
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session as DbSession

from .. import config, schemas, security
from ..db import get_db
from ..models import Material, User, utcnow
from ._common import delete_stored_file, owned_lecture, owned_material, store_upload

router = APIRouter(tags=["materials"])

_IMAGE_EXT = {".png", ".jpg", ".jpeg", ".gif", ".webp", ".bmp", ".svg", ".avif"}


def _classify(suffix: str) -> str:
    """Mirror of the frontend's materialKind(), by extension."""
    if suffix == ".pdf":
        return "pdf"
    if suffix in _IMAGE_EXT:
        return "image"
    if suffix in {".pptx", ".ppt"}:
        return "pptx"
    if suffix in {".docx", ".doc"}:
        return "docx"
    return "other"


@router.post(
    "/lectures/{lecture_id}/materials",
    response_model=schemas.MaterialOut,
    status_code=201,
)
async def upload_material(
    lecture_id: str,
    file: UploadFile = File(...),
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    lecture = owned_lecture(db, lecture_id, user)

    if not file.filename:
        raise HTTPException(status_code=400, detail="No file uploaded.")
    suffix = Path(file.filename).suffix.lower()
    if suffix not in config.ALLOWED_MATERIAL_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail=f"Unsupported material type '{suffix or file.filename}'. "
                   f"Allowed: {', '.join(sorted(config.ALLOWED_MATERIAL_EXTENSIONS))}.",
        )

    kind = _classify(suffix)
    material = Material(
        lecture_id=lecture.id,
        name=file.filename,
        kind=kind,
        # A single image is one page; page counts for PDFs/decks need the
        # conversion step that does not exist yet.
        page_count=1 if kind == "image" else None,
        status="ready",
    )
    db.add(material)
    db.flush()

    rel_path = f"{user.id}/materials/{material.id}{suffix}"
    material.size_bytes = await store_upload(
        file, config.MEDIA_DIR / rel_path, config.MAX_MATERIAL_BYTES
    )
    material.stored_path = rel_path

    # First material added becomes the one on screen.
    if lecture.active_material_id is None:
        lecture.active_material_id = material.id
        lecture.active_page = 1
    lecture.updated_at = utcnow()
    db.commit()
    db.refresh(material)
    return schemas.MaterialOut.model_validate(material)


@router.get("/materials/{material_id}/file")
def get_material_file(
    material_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    """Serve a stored material back to its owner for in-browser preview."""
    material = owned_material(db, material_id, user)
    if not material.stored_path:
        raise HTTPException(status_code=404, detail="No file stored.")

    path = config.MEDIA_DIR / material.stored_path
    if not path.is_file():
        raise HTTPException(status_code=404, detail="File is missing from disk.")

    media_type = mimetypes.guess_type(material.name)[0] or "application/octet-stream"
    # inline so the browser previews PDFs and images rather than downloading.
    return FileResponse(
        path,
        media_type=media_type,
        headers={"Content-Disposition": f'inline; filename="{material.id}{path.suffix}"'},
    )


@router.delete("/materials/{material_id}", status_code=204)
def delete_material(
    material_id: str,
    db: DbSession = Depends(get_db),
    user: User = Depends(security.get_current_user),
):
    material = owned_material(db, material_id, user)
    lecture = material.lecture

    delete_stored_file(material.stored_path)
    db.delete(material)
    db.flush()

    # Fall back to whatever material is left, mirroring the UI's behaviour.
    if lecture.active_material_id == material_id:
        remaining = [m for m in lecture.materials if m.id != material_id]
        lecture.active_material_id = remaining[0].id if remaining else None
        lecture.active_page = 1
    lecture.updated_at = utcnow()
    db.commit()
