"""
Password hashing, login tokens, and the "who is calling" dependency.

The cookie holds a random token; the database stores only its SHA-256, so a
leaked database file cannot be replayed as a valid login.
"""

from __future__ import annotations

import hashlib
import secrets
from datetime import timedelta

import bcrypt
from fastapi import Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session as DbSession

from . import config
from .db import get_db
from .models import AuthSession, User, utcnow

# bcrypt truncates silently past 72 bytes; reject rather than quietly ignore.
MAX_PASSWORD_BYTES = 72


def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt(rounds=12)).decode()


def verify_password(password: str, password_hash: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))
    except (ValueError, TypeError):
        return False


def _hash_token(token: str) -> str:
    return hashlib.sha256(token.encode("utf-8")).hexdigest()


def issue_session(db: DbSession, user: User, response: Response) -> str:
    """Create a login row and set the cookie. Returns the raw token."""
    token = secrets.token_urlsafe(32)
    auth = AuthSession(
        token_hash=_hash_token(token),
        user_id=user.id,
        expires_at=utcnow() + timedelta(days=config.SESSION_TTL_DAYS),
    )
    db.add(auth)
    db.commit()

    response.set_cookie(
        key=config.SESSION_COOKIE_NAME,
        value=token,
        max_age=config.SESSION_TTL_DAYS * 24 * 3600,
        httponly=True,        # unreadable from JavaScript
        samesite="lax",       # blocks cross-site POSTs carrying the cookie
        secure=config.COOKIE_SECURE,
        path="/",
    )
    return token


def revoke_session(db: DbSession, token: str | None, response: Response) -> None:
    if token:
        db.query(AuthSession).filter(
            AuthSession.token_hash == _hash_token(token)
        ).delete()
        db.commit()
    response.delete_cookie(config.SESSION_COOKIE_NAME, path="/")


def get_current_user_optional(
    db: DbSession = Depends(get_db),
    minuteman_session: str | None = Cookie(default=None, alias=config.SESSION_COOKIE_NAME),
) -> User | None:
    """Resolve the signed-in user, or None. Expired logins are cleaned up."""
    if not minuteman_session:
        return None

    auth = db.get(AuthSession, _hash_token(minuteman_session))
    if auth is None:
        return None

    # Rows are written with naive UTC datetimes; compare like for like.
    if auth.expires_at < utcnow().replace(tzinfo=None):
        db.delete(auth)
        db.commit()
        return None

    return db.get(User, auth.user_id)


def get_current_user(
    user: User | None = Depends(get_current_user_optional),
) -> User:
    """Require a signed-in user. Raises 401 otherwise."""
    if user is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Not signed in.",
        )
    return user
