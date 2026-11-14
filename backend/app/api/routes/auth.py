from fastapi import APIRouter, Response, status

from app.api import presenters as p
from app.api.deps import ADMIN_COOKIE, DB, USER_COOKIE, CurrentAdmin, clear_cookie, rate_limit, set_cookie
from app.api.errors import errors
from app.api.schemas.identity import (
    AdminEnvelope,
    EmailRequest,
    ResetPasswordRequest,
    SignInRequest,
    SignUpAccepted,
    SignUpRequest,
    TokenRequest,
    UserEnvelope,
)
from app.core.config import get_settings
from app.services import identity

router = APIRouter(tags=["Auth"])


@router.post(
    "/auth/signup",
    status_code=202,
    response_model=SignUpAccepted,
    responses=errors(400, 429),
    dependencies=[rate_limit("signup", 10, 60)],
)
def sign_up(body: SignUpRequest, s: DB):
    """Create a customer account and email a verification link. Does not sign in.

    Answers the same whether or not the email is already registered (the owner gets an email instead).
    """
    identity.sign_up(s, **body.model_dump())
    return SignUpAccepted(email=body.email.lower(), message="Check your email for a link to confirm your account.")


@router.post("/auth/verify-email", response_model=UserEnvelope, responses=errors(400))
def verify_email(body: TokenRequest, s: DB, response: Response):
    """Confirm the email from the emailed link (sets `email_verified_at`) and sign in."""
    user = identity.verify_email(s, body.token)
    set_cookie(response, USER_COOKIE, identity.user_token(user), get_settings().user_token_hours)
    return UserEnvelope(user=p.user(user))


@router.post(
    "/auth/resend-verification", status_code=202, responses=errors(429), dependencies=[rate_limit("resend", 5, 60)]
)
def resend_verification(body: EmailRequest, s: DB):
    """Email a new verification link. Answers the same whether or not the email exists."""
    identity.resend_verification(s, body.email)


@router.post(
    "/auth/signin",
    response_model=UserEnvelope,
    responses=errors(401, 403, 429),
    dependencies=[rate_limit("signin", 10, 60)],
)
def sign_in(body: SignInRequest, s: DB, response: Response):
    user = identity.sign_in(s, email=body.email, password=body.password)
    set_cookie(response, USER_COOKIE, identity.user_token(user), get_settings().user_token_hours)
    return UserEnvelope(user=p.user(user))


@router.post("/auth/signout", status_code=status.HTTP_204_NO_CONTENT)
def sign_out(response: Response):
    """Clear the cookie. Tokens are stateless, so a copied token stays valid until it expires."""
    clear_cookie(response, USER_COOKIE)


@router.post(
    "/auth/forgot-password", status_code=202, responses=errors(429), dependencies=[rate_limit("forgot", 5, 60)]
)
def forgot_password(body: EmailRequest, s: DB):
    """Email a password reset link. Answers the same whether or not the email exists."""
    identity.forgot_password(s, body.email)


@router.post("/auth/reset-password", status_code=204, responses=errors(400))
def reset_password(body: ResetPasswordRequest, s: DB):
    """Set a new password from the emailed link. The link stops working once the password changes."""
    identity.reset_password(s, body.token, body.password)


@router.post(
    "/admin/auth/signin",
    response_model=AdminEnvelope,
    responses=errors(401, 429),
    dependencies=[rate_limit("admin-signin", 5, 60)],
)
def admin_sign_in(body: SignInRequest, s: DB, response: Response):
    admin = identity.admin_sign_in(s, email=body.email, password=body.password)
    set_cookie(response, ADMIN_COOKIE, identity.admin_token(admin), get_settings().admin_token_hours)
    return AdminEnvelope(admin=p.admin(admin))


@router.post("/admin/auth/signout", status_code=204)
def admin_sign_out(response: Response):
    clear_cookie(response, ADMIN_COOKIE)


@router.get("/admin/me", response_model=AdminEnvelope, responses=errors(401))
def admin_me(admin: CurrentAdmin):
    return AdminEnvelope(admin=p.admin(admin))
