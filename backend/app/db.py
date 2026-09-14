"""
SQLite database setup.

One file on disk (data/minuteman.db by default), accessed through SQLAlchemy so
switching to Postgres later is a DATABASE_URL change rather than a rewrite.
"""

from __future__ import annotations

from collections.abc import Iterator

from sqlalchemy import create_engine, event
from sqlalchemy.orm import DeclarativeBase, Session, sessionmaker

from . import config


class Base(DeclarativeBase):
    pass


_connect_args = {}
if config.DATABASE_URL.startswith("sqlite"):
    # FastAPI serves requests from a threadpool, so the connection must not be
    # pinned to the thread that created it.
    _connect_args["check_same_thread"] = False

engine = create_engine(
    config.DATABASE_URL,
    connect_args=_connect_args,
    echo=config.SQL_ECHO,
)


if config.DATABASE_URL.startswith("sqlite"):

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection, _record):
        """Enforce foreign keys and use WAL so reads don't block on a write."""
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA foreign_keys=ON")
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA busy_timeout=5000")
        cursor.close()


SessionLocal = sessionmaker(bind=engine, autoflush=False, expire_on_commit=False)


def init_db() -> None:
    """Create any missing tables. Safe to call on every boot."""
    from . import models  # noqa: F401  — registers the mappings

    Base.metadata.create_all(bind=engine)


def get_db() -> Iterator[Session]:
    """FastAPI dependency: one database session per request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
