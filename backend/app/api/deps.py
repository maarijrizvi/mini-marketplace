"""Request plumbing: sessions, who is signed in, role checks, cookies and simple rate limits."""

import time
from collections import defaultdict, deque
from typing import Annotated

from fastapi import Depends, Request, Response
from fastapi.security import APIKeyCookie
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.db import get_session
from app.core.errors import ApiError
from app.data.models import Admin, SellerStatus, User
from app.services import identity
from app.services.common import Actor

USER_COOKIE = "mm_token"
ADMIN_COOKIE = "mm_admin_token"

_user_cookie = APIKeyCookie(name=USER_COOKIE, auto_error=False, description="Signed-in user (set by /auth/signin).")
_admin_cookie = APIKeyCookie(name=ADMIN_COOKIE, auto_error=False, description="Signed-in admin.")

DB = Annotated[Session, Depends(get_session)]


def current_user(s: DB, token: Annotated[str | None, Depends(_user_cookie)]) -> User:
    user = identity.user_for_token(s, token) if token else None
    if not user:
        raise ApiError(401, "unauthenticated", "Sign in to continue.")
    return user


def approved_seller(user: Annotated[User, Depends(current_user)]) -> User:
    if user.seller_status != SellerStatus.approved:
        raise ApiError(403, "not_approved_seller", "Your shop needs to be approved before you can do this.")
    return user


def current_admin(s: DB, token: Annotated[str | None, Depends(_admin_cookie)]) -> Admin:
    admin = identity.admin_for_token(s, token) if token else None
    if not admin:
        raise ApiError(401, "unauthenticated", "Sign in as an admin to continue.")
    return admin


def fulfilling_seller(user: Annotated[User, Depends(current_user)]) -> User:
    """Approved or suspended: a suspended shop still has to send the orders it already took."""
    if user.seller_status not in (SellerStatus.approved, SellerStatus.suspended):
        raise ApiError(403, "not_approved_seller", "Your shop needs to be approved before you can do this.")
    return user


CurrentUser = Annotated[User, Depends(current_user)]
Seller = Annotated[User, Depends(approved_seller)]
FulfillingSeller = Annotated[User, Depends(fulfilling_seller)]
CurrentAdmin = Annotated[Admin, Depends(current_admin)]


def admin_actor(admin: CurrentAdmin) -> Actor:
    return Actor.admin(admin.id)


AdminActor = Annotated[Actor, Depends(admin_actor)]


def set_cookie(response: Response, name: str, token: str, hours: int) -> None:
    response.set_cookie(
        name, token, max_age=hours * 3600, httponly=True, samesite="lax", secure=get_settings().cookie_secure, path="/"
    )


def clear_cookie(response: Response, name: str) -> None:
    response.delete_cookie(name, path="/", httponly=True, samesite="lax", secure=get_settings().cookie_secure)


# ── Rate limiting (per process; enough for one API container) ──────────

_hits: dict[str, deque[float]] = defaultdict(deque)


def rate_limit(name: str, limit: int, per_seconds: int):
    def check(request: Request) -> None:
        ip = request.headers.get("x-real-ip") or (request.client.host if request.client else "?")
        key, now = f"{name}:{ip}", time.monotonic()
        hits = _hits[key]
        while hits and now - hits[0] > per_seconds:
            hits.popleft()
        if len(hits) >= limit:
            raise ApiError(
                429,
                "rate_limited",
                "Too many attempts. Wait a minute and try again.",
                details={"retryAfter": int(per_seconds - (now - hits[0])) + 1},
            )
        hits.append(now)

    return Depends(check)
