"""Accounts: sign-up, email verification, sign-in, passwords, profile, addresses and seller applications."""

import uuid
from typing import Any

import phonenumbers
from sqlalchemy.orm import Session

from app.core import security
from app.core.config import get_settings
from app.core.errors import ApiError, field_error, invalid_transition, not_found
from app.data.models import Admin, SellerStatus, User
from app.data.repositories import identity as repo
from app.services import notifications
from app.services.common import Actor, now, record

# ── Validation helpers ─────────────────────────────────────────────────


def normalize_phone(raw: str, field: str = "phone") -> str:
    """Pakistani numbers, stored as E.164 (+923001234567)."""
    try:
        number = phonenumbers.parse(raw, "PK")
        if phonenumbers.is_valid_number(number):
            return phonenumbers.format_number(number, phonenumbers.PhoneNumberFormat.E164)
    except phonenumbers.NumberParseException:
        pass
    raise field_error(field, "Enter a valid Pakistani phone number, e.g. 0300 1234567.")


# ── Sign-up and verification ───────────────────────────────────────────


def sign_up(s: Session, *, email: str, password: str, first_name: str, last_name: str, phone: str) -> User:
    email = email.strip().lower()
    if repo.email_taken(s, email):
        raise ApiError(409, "email_taken", "An account with this email already exists. Sign in instead.")
    user = repo.add_user(
        s,
        User(
            email=email,
            password_hash=security.hash_password(password),
            first_name=first_name.strip(),
            last_name=last_name.strip(),
            phone=normalize_phone(phone),
            addresses=[],
        ),
    )
    record(s, Actor.user(user.id), "user", user.id, "signed_up")
    _send_verification(s, user)
    s.commit()
    return user


def _send_verification(s: Session, user: User) -> None:
    token = security.issue_token(user.id, "verify_email", get_settings().email_token_minutes, email=user.email)
    notifications.verify_email(s, user, token)


def verify_email(s: Session, token: str) -> User:
    claims = _read(token, "verify_email")
    user = repo.user_by_id(s, int(claims["sub"]), lock=True)
    if not user or user.email != claims.get("email"):
        raise ApiError(400, "invalid_token", "This link isn't valid. Request a new one.")
    if user.email_verified_at is None:
        user.email_verified_at = now()
        record(s, Actor.user(user.id), "user", user.id, "email_verified")
    s.commit()
    return user


def resend_verification(s: Session, email: str) -> None:
    user = repo.user_by_email(s, email.strip())
    if user and user.email_verified_at is None:
        _send_verification(s, user)
        s.commit()


# ── Sign-in ────────────────────────────────────────────────────────────


def sign_in(s: Session, *, email: str, password: str) -> User:
    user = repo.user_by_email(s, email.strip())
    if not security.verify_password(user.password_hash if user else None, password) or not user:
        raise ApiError(401, "invalid_credentials", "That email and password don't match.")
    if user.email_verified_at is None:
        raise ApiError(403, "email_not_verified", "Confirm your email first. We can send a new link.")
    return user


def admin_sign_in(s: Session, *, email: str, password: str) -> Admin:
    admin = repo.admin_by_email(s, email.strip())
    ok = security.verify_password(admin.password_hash if admin else None, password)
    if not ok or not admin or not admin.is_active:
        raise ApiError(401, "invalid_credentials", "That email and password don't match.")
    admin.last_login_at = now()
    record(s, Actor.admin(admin.id), "admin", admin.id, "signed_in")
    s.commit()
    return admin


def user_for_token(s: Session, token: str) -> User | None:
    try:
        claims = security.read_token(token, "user")
    except security.TokenError:
        return None
    user = repo.user_by_id(s, int(claims["sub"]))
    return user if user and user.email_verified_at else None


def admin_for_token(s: Session, token: str) -> Admin | None:
    try:
        claims = security.read_token(token, "admin")
    except security.TokenError:
        return None
    admin = repo.admin_by_id(s, int(claims["sub"]))
    return admin if admin and admin.is_active else None


def user_token(user: User) -> str:
    return security.issue_token(user.id, "user", get_settings().user_token_hours * 60)


def admin_token(admin: Admin) -> str:
    return security.issue_token(admin.id, "admin", get_settings().admin_token_hours * 60)


# ── Passwords ──────────────────────────────────────────────────────────


def forgot_password(s: Session, email: str) -> None:
    user = repo.user_by_email(s, email.strip())
    if not user:
        return
    token = security.issue_token(
        user.id,
        "reset_password",
        get_settings().reset_token_minutes,
        pw=security.password_fingerprint(user.password_hash),
    )
    notifications.reset_password(s, user, token)
    s.commit()


def reset_password(s: Session, token: str, password: str) -> None:
    claims = _read(token, "reset_password")
    user = repo.user_by_id(s, int(claims["sub"]), lock=True)
    # The token carries a fingerprint of the old hash: once the password changes it can't be used again.
    if not user or claims.get("pw") != security.password_fingerprint(user.password_hash):
        raise ApiError(400, "invalid_token", "This link has already been used or isn't valid. Request a new one.")
    user.password_hash = security.hash_password(password)
    # Following the emailed link proves the email address, so verify it too.
    user.email_verified_at = user.email_verified_at or now()
    record(s, Actor.user(user.id), "user", user.id, "password_reset")
    s.commit()


def change_password(s: Session, user: User, current: str, new: str) -> None:
    if not security.verify_password(user.password_hash, current):
        raise field_error("currentPassword", "That's not your current password.", code="wrong_password")
    user.password_hash = security.hash_password(new)
    record(s, Actor.user(user.id), "user", user.id, "password_changed")
    s.commit()


def _read(token: str, audience: security.Audience) -> dict:
    try:
        return security.read_token(token, audience)
    except security.TokenError as e:
        message = "This link has expired. Request a new one." if e.code == "token_expired" else "This link isn't valid."
        raise ApiError(400, e.code, message) from e


# ── Profile ────────────────────────────────────────────────────────────


def update_profile(s: Session, user: User, changes: dict[str, Any]) -> User:
    before = {"firstName": user.first_name, "lastName": user.last_name, "phone": user.phone}
    if "first_name" in changes:
        user.first_name = changes["first_name"].strip()
    if "last_name" in changes:
        user.last_name = changes["last_name"].strip()
    if "phone" in changes:
        user.phone = normalize_phone(changes["phone"])
    record(s, Actor.user(user.id), "user", user.id, "profile_updated", before=before)
    s.commit()
    return user


# ── Addresses (a JSONB list on users; the first one is the default) ────


def add_address(s: Session, user: User, address: dict[str, Any]) -> list[dict[str, Any]]:
    entry = {"id": str(uuid.uuid4()), **_clean_address(address)}
    user.addresses = [*user.addresses, entry]
    s.commit()
    return user.addresses


def update_address(s: Session, user: User, address_id: str, address: dict[str, Any]) -> list[dict[str, Any]]:
    _find_address(user, address_id)
    user.addresses = [
        {"id": a["id"], **_clean_address(address)} if a["id"] == address_id else a for a in user.addresses
    ]
    s.commit()
    return user.addresses


def remove_address(s: Session, user: User, address_id: str) -> list[dict[str, Any]]:
    _find_address(user, address_id)
    user.addresses = [a for a in user.addresses if a["id"] != address_id]
    s.commit()
    return user.addresses


def make_default_address(s: Session, user: User, address_id: str) -> list[dict[str, Any]]:
    chosen = _find_address(user, address_id)
    user.addresses = [chosen, *[a for a in user.addresses if a["id"] != address_id]]
    s.commit()
    return user.addresses


def find_address(user: User, address_id: str) -> dict[str, Any]:
    return _find_address(user, address_id)


def _find_address(user: User, address_id: str) -> dict[str, Any]:
    for a in user.addresses:
        if a["id"] == address_id:
            return a
    raise not_found("That address doesn't exist.")


def _clean_address(address: dict[str, Any]) -> dict[str, Any]:
    """The database can't check fields inside JSONB, so every address is validated and normalised here."""
    out = {k: (v.strip() if isinstance(v, str) else v) for k, v in address.items() if v not in (None, "")}
    out["phone"] = normalize_phone(out["phone"], "phone")
    return out


# ── Selling ────────────────────────────────────────────────────────────


def apply_to_sell(s: Session, user: User, shop_name: str) -> User:
    user = repo.user_by_id(s, user.id, lock=True)
    if user.seller_status in (SellerStatus.pending, SellerStatus.approved, SellerStatus.suspended):
        raise invalid_transition(f"Your shop application is already {user.seller_status}.")
    shop_name = " ".join(shop_name.split())
    if repo.shop_name_taken(s, shop_name, except_user=user.id):
        raise ApiError(
            409,
            "shop_name_taken",
            "Another shop already uses this name.",
            field_errors={"shopName": ["Another shop already uses this name."]},
        )
    user.shop_name = shop_name
    user.seller_status = SellerStatus.pending
    user.seller_status_reason = None
    record(s, Actor.user(user.id), "user", user.id, "seller_applied", shopName=shop_name)
    s.commit()
    return user
