"""Payment outcomes: gateway webhooks, expired holds, refund jobs and the sandbox gateway page."""

from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, invalid_transition, not_found
from app.data.models import OrderStatus, PaymentKind, PaymentMethod, PaymentStatus, Reservation, User
from app.data.repositories import jobs, orders
from app.data.repositories import money as repo
from app.integrations import payment_gateway
from app.services import money, notifications, ordering, stock
from app.services.common import SYSTEM, now, record, ship_deadline


def handle_webhook(s: Session, payload: dict[str, Any]) -> None:
    """Apply a gateway result. Repeat-safe: a payment that is already final is never changed."""
    payment = repo.payment(s, int(payload["paymentId"]), lock=True)
    if not payment or payment.provider_ref != payload["providerRef"]:
        raise not_found("Unknown payment.")
    record(s, SYSTEM, "payment", payment.id, "webhook_received", payload=payload)
    if payment.status != PaymentStatus.pending:
        s.commit()
        return
    succeeded = payload["status"] == "succeeded"
    payment.status = PaymentStatus.succeeded if succeeded else PaymentStatus.failed
    s.flush()  # later queries in this transaction (e.g. finding the charge to refund) must see it

    if payment.kind == PaymentKind.refund:
        record(s, SYSTEM, "payment", payment.id, f"refund_{payment.status}")
        s.commit()
        return

    order = orders.get(s, payment.order_id, lock=True)
    if succeeded:
        _charge_succeeded(s, order, payment)
    elif order.status == OrderStatus.pending_payment:
        ordering.release_all(s, SYSTEM, order)
        order.status = OrderStatus.cancelled
        record(s, SYSTEM, "order", order.id, "cancelled", reason=payload.get("failureReason") or "Payment failed")
    s.commit()


def _charge_succeeded(s: Session, order, payment) -> None:
    record(s, SYSTEM, "payment", payment.id, "charge_succeeded", amount=payment.amount)
    held = [i for p in order.parcels for i in p.items if i.reservation == Reservation.held]
    if order.status == OrderStatus.pending_payment and held:
        variants = stock.lock_for(s, held)
        for item in held:
            stock.commit(s, SYSTEM, variants[item.variant_id], item)
            item.reserved_until = None
        order.status = OrderStatus.placed
        deadline = ship_deadline(now())
        for parcel in order.parcels:
            parcel.ship_deadline = deadline
        record(s, SYSTEM, "order", order.id, "placed", total=order.total)
        notifications.order_placed(s, order.user, order)
    else:
        # The money arrived after the hold expired or the order was cancelled: give it back.
        money.refund(s, SYSTEM, order, payment.amount, reason="Payment arrived after the order was closed")


def release_expired(s: Session, order_id: int) -> None:
    """Job: release a pending online order's stock once its hold has passed."""
    order = orders.get(s, order_id, lock=True)
    if not order or order.status != OrderStatus.pending_payment:
        return
    held = [i for p in order.parcels for i in p.items if i.reservation == Reservation.held]
    if not held or any(i.reserved_until and i.reserved_until > now() for i in held):
        return
    ordering.release_all(s, SYSTEM, order)
    order.status = OrderStatus.cancelled
    record(s, SYSTEM, "order", order.id, "cancelled", reason="Payment not received before the hold expired")
    s.commit()


def sweep_expired(s: Session) -> int:
    """Safety net for lost jobs: release every expired hold."""
    ids = orders.expired_holds(s, now())
    for order_id in ids:
        release_expired(s, order_id)
    return len(ids)


def issue_refund(s: Session, payment_id: int) -> None:
    """Job: ask the gateway to refund. The simulated gateway confirms with a signed webhook."""
    payment = repo.payment(s, payment_id)
    if not payment or payment.kind != PaymentKind.refund or payment.status != PaymentStatus.pending:
        return
    body = payment_gateway.webhook_body(
        payment_id=payment.id, provider_ref=payment.provider_ref, kind="refund", status="succeeded"
    )
    status = payment_gateway.send_webhook(get_settings().api_internal_url, body)
    if status >= 300:
        raise RuntimeError(f"Refund webhook was answered with HTTP {status}")


# ── Sandbox gateway ────────────────────────────────────────────────────


def sandbox_payment(s: Session, payment_id: int, user: User):
    """The gateway page for one charge. Only the customer who placed the order can see or act on it."""
    payment = repo.payment(s, payment_id)
    if not payment or payment.kind != PaymentKind.charge or payment.method == PaymentMethod.cod:
        raise not_found("Unknown payment.")
    order = orders.get(s, payment.order_id)
    if order.user_id != user.id:
        raise not_found("Unknown payment.")
    return payment, order


def sandbox_complete(s: Session, payment_id: int, outcome: str, user: User) -> None:
    payment, _ = sandbox_payment(s, payment_id, user)
    if payment.status != PaymentStatus.pending:
        raise invalid_transition("This payment is already finished.")
    if outcome == "no_answer":
        return  # the gateway never answers; the hold will expire
    jobs.defer(s, "sandbox_payment_webhook", {"payment_id": payment.id, "outcome": outcome})
    s.commit()


def send_sandbox_webhook(s: Session, payment_id: int, outcome: str) -> None:
    """Job: the simulated gateway posts its result to our webhook endpoint."""
    payment = repo.payment(s, payment_id)
    if not payment:
        return
    body = payment_gateway.webhook_body(
        payment_id=payment.id,
        provider_ref=payment.provider_ref,
        kind="charge",
        status=outcome,
        failure="Card declined (sandbox)" if outcome == "failed" else None,
    )
    status = payment_gateway.send_webhook(get_settings().api_internal_url, body)
    if status >= 300:
        raise ApiError(502, "webhook_rejected", f"Webhook answered HTTP {status}")
