"""Registration, login, logout, and the current-user probe."""

from __future__ import annotations

from fastapi import APIRouter, Cookie, Depends, HTTPException, Response, status
from sqlalchemy.orm import Session as DbSession

from .. import config, schemas, security
from ..db import get_db
from ..models import User

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/register", response_model=schemas.UserOut, status_code=201)
def register(
    payload: schemas.RegisterRequest,
    response: Response,
    db: DbSession = Depends(get_db),
):
    if not config.REGISTRATION_OPEN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Registration is closed on this server.",
        )

    email = payload.email.strip().lower()
    if db.query(User).filter(User.email == email).first():
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail="An account with that email already exists.",
        )

    user = User(
        email=email,
        password_hash=security.hash_password(payload.password),
        display_name=(payload.display_name or "").strip() or None,
    )
    db.add(user)
    db.commit()

    security.issue_session(db, user, response)
    return user


@router.post("/login", response_model=schemas.UserOut)
def login(
    payload: schemas.LoginRequest,
    response: Response,
    db: DbSession = Depends(get_db),
):
    email = payload.email.strip().lower()
    user = db.query(User).filter(User.email == email).first()

    # Same message and roughly the same work either way, so the response does
    # not reveal whether an account exists.
    if user is None or not security.verify_password(payload.password, user.password_hash):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password.",
        )

    security.issue_session(db, user, response)
    return user


@router.post("/logout", status_code=204)
def logout(
    response: Response,
    db: DbSession = Depends(get_db),
    minuteman_session: str | None = Cookie(
        default=None, alias=config.SESSION_COOKIE_NAME
    ),
):
    security.revoke_session(db, minuteman_session, response)
    return Response(status_code=204)


@router.get("/me", response_model=schemas.UserOut)
def me(user: User = Depends(security.get_current_user)):
    return user
