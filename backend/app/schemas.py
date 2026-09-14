"""
Pydantic request and response models.

Field names are camelCase on the wire (via alias) so the TypeScript frontend
can consume them without a translation layer, while Python keeps snake_case.
"""

from __future__ import annotations

from datetime import datetime

from pydantic import BaseModel, ConfigDict, EmailStr, Field
from pydantic.alias_generators import to_camel

from . import config


class ORMModel(BaseModel):
    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ApiModel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


# --------------------------------------------------------------------------- #
# Auth
# --------------------------------------------------------------------------- #

class RegisterRequest(ApiModel):
    email: EmailStr
    password: str = Field(min_length=config.MIN_PASSWORD_LENGTH, max_length=72)
    display_name: str | None = Field(default=None, max_length=120)


class LoginRequest(ApiModel):
    email: EmailStr
    password: str = Field(max_length=72)


class UserOut(ORMModel):
    id: str
    email: str
    display_name: str | None
    created_at: datetime


# --------------------------------------------------------------------------- #
# Lecture contents
# --------------------------------------------------------------------------- #

class SegmentOut(ORMModel):
    start: float
    end: float
    text: str


class MaterialOut(ORMModel):
    id: str
    name: str
    kind: str
    size_bytes: int | None
    page_count: int | None
    status: str
    created_at: datetime


class AudioOut(ORMModel):
    id: str
    name: str
    status: str
    text: str
    language: str | None
    model: str | None
    duration_sec: float | None
    size_bytes: int | None
    error_msg: str | None
    created_at: datetime
    segments: list[SegmentOut] = []


class ExplanationOut(ORMModel):
    material_id: str
    page: int
    start_sec: float | None
    end_sec: float | None
    explanation: str
    ai_filled: bool


class MessageOut(ORMModel):
    id: str
    type: str
    content: str
    tone: str | None
    created_at: datetime


class LectureSummary(ORMModel):
    """Sidebar row — counts only, so listing stays cheap."""
    id: str
    title: str
    created_at: datetime
    updated_at: datetime
    material_count: int = 0
    has_audio: bool = False


class LectureDetail(ORMModel):
    id: str
    title: str
    active_material_id: str | None
    active_page: int
    created_at: datetime
    updated_at: datetime
    materials: list[MaterialOut] = []
    audio: AudioOut | None = None
    explanations: list[ExplanationOut] = []
    messages: list[MessageOut] = []


class LectureCreate(ApiModel):
    title: str = Field(default="Untitled lecture", max_length=200)


class LectureUpdate(ApiModel):
    """Every field optional — used for renaming and for saving view state."""
    title: str | None = Field(default=None, min_length=1, max_length=200)
    active_material_id: str | None = None
    active_page: int | None = Field(default=None, ge=1)


class MessageCreate(ApiModel):
    type: str = Field(pattern="^(system|user|ai)$")
    content: str = Field(default="", max_length=20000)
    tone: str | None = Field(default=None, max_length=20)
