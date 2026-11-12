"""Passwords, sign-in tokens and the signed one-time tokens used in emailed links.

No session or token table exists (ERD decision): everything here is stateless and signed with `JWT_SECRET`.
"""

import hashlib
import hmac
from datetime import UTC, datetime, timedelta
from typing import Literal

import jwt
from argon2 import PasswordHasher
from argon2.exceptions import InvalidHashError, VerifyMismatchError

from app.core.config import get_settings

_hasher = PasswordHasher()
# Used to keep sign-in timing the same whether or not the email exists.
_DUMMY_HASH = _hasher.hash("timing-equaliser")

Audience = Literal["user", "admin", "verify_email", "reset_password"]


def hash_password(password: str) -> str:
    return _hasher.hash(password)


def verify_password(password_hash: str | None, password: str) -> bool:
    try:
        return _hasher.verify(password_hash or _DUMMY_HASH, password) and password_hash is not None
    except (VerifyMismatchError, InvalidHashError):
        return False


def password_fingerprint(password_hash: str) -> str:
    """Short digest of the current hash: a reset token carrying it dies once the password changes."""
    return hashlib.sha256(password_hash.encode()).hexdigest()[:16]


def issue_token(subject: int, audience: Audience, minutes: int, **claims: str) -> str:
    now = datetime.now(UTC)
    payload = {"sub": str(subject), "aud": audience, "iat": now, "exp": now + timedelta(minutes=minutes), **claims}
    return jwt.encode(payload, get_settings().jwt_secret, algorithm="HS256")


class TokenError(Exception):
    def __init__(self, code: Literal["invalid_token", "token_expired"]):
        super().__init__(code)
        self.code = code


def read_token(token: str, audience: Audience) -> dict:
    try:
        return jwt.decode(token, get_settings().jwt_secret, algorithms=["HS256"], audience=audience)
    except jwt.ExpiredSignatureError as e:
        raise TokenError("token_expired") from e
    except jwt.PyJWTError as e:
        raise TokenError("invalid_token") from e


def sign_webhook(secret: str, body: bytes) -> str:
    return hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()


def webhook_signature_ok(secret: str, body: bytes, signature: str | None) -> bool:
    return bool(signature) and hmac.compare_digest(sign_webhook(secret, body), signature or "")
