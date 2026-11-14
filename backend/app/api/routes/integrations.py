from typing import Annotated

from fastapi import APIRouter, Depends, Header, Request
from sqlalchemy import text
from starlette.concurrency import run_in_threadpool

from app.api.deps import ADMIN_COOKIE, DB, USER_COOKIE, CurrentUser
from app.api.errors import errors
from app.api.schemas.base import Id
from app.api.schemas.ops import (
    LeopardsWebhook,
    PaymentWebhook,
    SandboxCourierEvent,
    SandboxPaymentComplete,
    SandboxPaymentView,
)
from app.core.config import get_settings
from app.core.errors import ApiError, not_found
from app.core.security import webhook_signature_ok
from app.services import fulfilment, identity, payments

router = APIRouter()


# ── Webhooks ───────────────────────────────────────────────────────────


async def _signed(request: Request, secret: str, signature: str | None) -> bytes:
    body = await request.body()
    if not webhook_signature_ok(secret, body, signature):
        raise ApiError(401, "bad_signature", "The webhook signature doesn't match.")
    return body


@router.post("/webhooks/payments", tags=["Webhooks"], status_code=200, responses=errors(401, 404))
async def payment_webhook(
    request: Request, s: DB, x_signature: Annotated[str | None, Header(alias="X-Signature")] = None
):
    """Gateway result. Charge succeeded → items committed, order placed. Charge failed → items released, order
    cancelled. Refund result → the refund row becomes final. Repeat-safe; raw payload kept in the audit log."""
    body = await _signed(request, get_settings().payment_webhook_secret, x_signature)
    event = PaymentWebhook.model_validate_json(body)
    await run_in_threadpool(payments.handle_webhook, s, event.model_dump(by_alias=True, mode="json"))
    return {"ok": True}


@router.post("/webhooks/leopards", tags=["Webhooks"], status_code=200, responses=errors(401, 404))
async def leopards_webhook(
    request: Request, s: DB, x_signature: Annotated[str | None, Header(alias="X-Signature")] = None
):
    """Courier event: picked_up → shipped; then delivered, refused or delivery_failed. Status only moves forward.
    A delivered COD parcel records the cash collected and the seller's sale and commission."""
    body = await _signed(request, get_settings().leopards_webhook_secret, x_signature)
    event = LeopardsWebhook.model_validate_json(body)
    if not await run_in_threadpool(fulfilment.courier_event, s, event.model_dump(by_alias=True, mode="json")):
        raise not_found("Unknown tracking number.")
    return {"ok": True}


# ── Sandbox (simulated gateway and courier; off in production) ─────────


def _sandbox_on() -> None:
    if not get_settings().sandbox_enabled:
        raise not_found("Not found.")


sandbox = APIRouter(prefix="/sandbox", tags=["Sandbox"], dependencies=[Depends(_sandbox_on)])


@sandbox.get("/payments/{payment_id}", response_model=SandboxPaymentView, responses=errors(401, 404))
def sandbox_payment(payment_id: Id, s: DB, user: CurrentUser):
    """What the simulated gateway's payment page shows. Only the order's customer can open it."""
    payment, order = payments.sandbox_payment(s, payment_id, user)
    return SandboxPaymentView(
        payment_id=payment.id,
        order_id=order.id,
        amount=payment.amount,
        method=payment.method.value,
        status=payment.status.value,
    )


@sandbox.post("/payments/{payment_id}/complete", status_code=202, responses=errors(401, 404, 409))
def sandbox_complete(payment_id: Id, body: SandboxPaymentComplete, s: DB, user: CurrentUser):
    """The gateway page's buttons, for the order's customer only. The gateway then posts `/webhooks/payments`."""
    payments.sandbox_complete(s, payment_id, body.outcome, user)
    return {"ok": True}


@sandbox.post("/leopards/{tracking_no}/events", status_code=202, responses=errors(401, 404))
def sandbox_courier(tracking_no: str, body: SandboxCourierEvent, request: Request, s: DB):
    """Simulate a courier scan; Leopards then posts `/webhooks/leopards`. Only the parcel's own seller or an admin
    can do this; for anyone else the tracking number doesn't exist."""
    admin_token, user_token = request.cookies.get(ADMIN_COOKIE), request.cookies.get(USER_COOKIE)
    if admin_token and identity.admin_for_token(s, admin_token):
        seller_id = None  # admins may scan any parcel
    else:
        user = identity.user_for_token(s, user_token) if user_token else None
        if not user:
            raise ApiError(401, "unauthenticated", "Sign in to simulate courier events.")
        seller_id = user.id
    if not fulfilment.sandbox_courier_event(s, tracking_no, body.event, seller_id=seller_id):
        raise not_found("Unknown tracking number.")
    return {"ok": True}


# ── Health ─────────────────────────────────────────────────────────────

health = APIRouter(prefix="/health", tags=["Health"])


@health.get("/live")
def live():
    return {"status": "ok"}


@health.get("/ready", responses={503: {"description": "Database unreachable"}})
def ready(s: DB):
    try:
        s.execute(text("SELECT 1"))
    except Exception as e:
        raise ApiError(503, "not_ready", "Database unreachable.") from e
    return {"status": "ok"}
