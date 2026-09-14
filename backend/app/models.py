"""
Database tables.

Ownership chain: User -> Lecture -> {Material, AudioTrack, Explanation, Message}.
Every API query scopes by the signed-in user, and the cascades below mean
deleting a user or a lecture cleans up everything beneath it.

Note on naming: AuthSession is a login; SQLAlchemy's Session is the DB handle.
A Lecture is what the UI calls a lecture — a recording plus its class materials.
"""

from __future__ import annotations

import uuid
from datetime import datetime, timezone

from sqlalchemy import (
    Boolean, DateTime, Float, ForeignKey, Index, Integer, String, Text,
    UniqueConstraint,
)
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .db import Base


def _uuid() -> str:
    return uuid.uuid4().hex


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(Base):
    __tablename__ = "users"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    # Stored lowercase, so uniqueness is case-insensitive in practice.
    email: Mapped[str] = mapped_column(String(320), unique=True, nullable=False)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    display_name: Mapped[str | None] = mapped_column(String(120))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    lectures: Mapped[list["Lecture"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )
    auth_sessions: Mapped[list["AuthSession"]] = relationship(
        back_populates="user", cascade="all, delete-orphan"
    )


class AuthSession(Base):
    """A login. The cookie carries a random token; only its hash is stored."""

    __tablename__ = "auth_sessions"

    token_hash: Mapped[str] = mapped_column(String(64), primary_key=True)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    expires_at: Mapped[datetime] = mapped_column(DateTime, nullable=False)

    user: Mapped[User] = relationship(back_populates="auth_sessions")


class Lecture(Base):
    """One class: its recording, its slides, and everything derived from them."""

    __tablename__ = "lectures"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    user_id: Mapped[str] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), nullable=False, index=True
    )
    title: Mapped[str] = mapped_column(String(200), default="Untitled lecture")
    # Where the reader left off, so reopening a lecture restores the view.
    active_material_id: Mapped[str | None] = mapped_column(String(32))
    active_page: Mapped[int] = mapped_column(Integer, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, default=utcnow, onupdate=utcnow
    )

    user: Mapped[User] = relationship(back_populates="lectures")
    materials: Mapped[list["Material"]] = relationship(
        back_populates="lecture",
        cascade="all, delete-orphan",
        order_by="Material.created_at",
    )
    audio: Mapped["AudioTrack | None"] = relationship(
        back_populates="lecture", cascade="all, delete-orphan", uselist=False
    )
    explanations: Mapped[list["Explanation"]] = relationship(
        back_populates="lecture", cascade="all, delete-orphan"
    )
    messages: Mapped[list["Message"]] = relationship(
        back_populates="lecture",
        cascade="all, delete-orphan",
        order_by="Message.created_at",
    )


class Material(Base):
    """A slide deck, PDF, or image attached to a lecture."""

    __tablename__ = "materials"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    lecture_id: Mapped[str] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    kind: Mapped[str] = mapped_column(String(20), default="other")
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    # Known once the file is processed; null means "not determined yet".
    page_count: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(String(20), default="ready")
    # Path relative to MEDIA_DIR, built from ids — never from the filename.
    stored_path: Mapped[str | None] = mapped_column(String(500))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    lecture: Mapped[Lecture] = relationship(back_populates="materials")


class AudioTrack(Base):
    """The lecture recording and its transcript. One per lecture."""

    __tablename__ = "audio_tracks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    lecture_id: Mapped[str] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"),
        nullable=False,
        unique=True,   # enforces the 1:1 the UI assumes
        index=True,
    )
    name: Mapped[str] = mapped_column(String(500), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="idle")
    text: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str | None] = mapped_column(String(16))
    model: Mapped[str | None] = mapped_column(String(20))
    duration_sec: Mapped[float | None] = mapped_column(Float)
    size_bytes: Mapped[int | None] = mapped_column(Integer)
    stored_path: Mapped[str | None] = mapped_column(String(500))
    error_msg: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    lecture: Mapped[Lecture] = relationship(back_populates="audio")
    segments: Mapped[list["Segment"]] = relationship(
        back_populates="audio",
        cascade="all, delete-orphan",
        order_by="Segment.idx",
    )


class Segment(Base):
    """A timestamped span of a transcript."""

    __tablename__ = "segments"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    audio_id: Mapped[str] = mapped_column(
        ForeignKey("audio_tracks.id", ondelete="CASCADE"), nullable=False, index=True
    )
    idx: Mapped[int] = mapped_column(Integer, nullable=False)
    start: Mapped[float] = mapped_column(Float, default=0.0)
    end: Mapped[float] = mapped_column(Float, default=0.0)
    text: Mapped[str] = mapped_column(Text, default="")

    audio: Mapped[AudioTrack] = relationship(back_populates="segments")

    __table_args__ = (UniqueConstraint("audio_id", "idx", name="uq_segment_order"),)


class Explanation(Base):
    """
    AI output linking one material page to the stretch of audio that covers it.

    Empty until the mapping step runs; `ai_filled` marks an explanation the AI
    supplied because the recording skipped that page.
    """

    __tablename__ = "explanations"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, autoincrement=True)
    lecture_id: Mapped[str] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    material_id: Mapped[str] = mapped_column(
        ForeignKey("materials.id", ondelete="CASCADE"), nullable=False, index=True
    )
    page: Mapped[int] = mapped_column(Integer, nullable=False)
    start_sec: Mapped[float | None] = mapped_column(Float)
    end_sec: Mapped[float | None] = mapped_column(Float)
    explanation: Mapped[str] = mapped_column(Text, default="")
    ai_filled: Mapped[bool] = mapped_column(Boolean, default=False)

    lecture: Mapped[Lecture] = relationship(back_populates="explanations")

    __table_args__ = (
        UniqueConstraint("material_id", "page", name="uq_explanation_page"),
    )


class Message(Base):
    """An entry in a lecture's chat stream, persisted so it survives a reload."""

    __tablename__ = "messages"

    id: Mapped[str] = mapped_column(String(32), primary_key=True, default=_uuid)
    lecture_id: Mapped[str] = mapped_column(
        ForeignKey("lectures.id", ondelete="CASCADE"), nullable=False, index=True
    )
    type: Mapped[str] = mapped_column(String(20), nullable=False)
    content: Mapped[str] = mapped_column(Text, default="")
    tone: Mapped[str | None] = mapped_column(String(20))
    created_at: Mapped[datetime] = mapped_column(DateTime, default=utcnow)

    lecture: Mapped[Lecture] = relationship(back_populates="messages")


Index("ix_auth_sessions_expires", AuthSession.expires_at)
Index("ix_lectures_user_updated", Lecture.user_id, Lecture.updated_at)
