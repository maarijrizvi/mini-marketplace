"""Sellers fulfilling their parcels, and Leopards Courier events moving them on."""

from datetime import datetime
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import invalid_transition, not_found
from app.data.models import (
    ItemStatus,
    OrderPaymentMethod,
    ParcelStatus,
    Payment,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    SellerOrder,
    User,
)
from app.data.pagination import Page
from app.data.repositories import jobs, orders
from app.data.repositories import money as money_repo
from app.integrations import leopards
from app.services import money, notifications, ordering, stock
from app.services.common import SYSTEM, Actor, now, record

# ── Seller views ───────────────────────────────────────────────────────


def parcels(s: Session, seller: User, **filters) -> Page[SellerOrder]:
    return orders.seller_parcels(s, seller.id, now=now(), **filters)


def parcel(s: Session, seller: User, parcel_id: int) -> SellerOrder:
    return orders.own_parcel(s, seller.id, parcel_id) or _missing()


def is_late(p: SellerOrder) -> bool:
    if p.picked_up_at:
        return p.picked_up_at > p.ship_deadline
    return p.status == ParcelStatus.pending and p.ship_deadline < now()


# ── Seller actions ─────────────────────────────────────────────────────


def drop_item(s: Session, seller: User, parcel_id: int, item_id: int, reason: str, note: str | None) -> SellerOrder:
    """Drop one item the seller can't send. Its stock is released and the customer stops paying for it."""
    order_id = (orders.own_parcel(s, seller.id, parcel_id) or _missing()).order_id
    order = orders.get(s, order_id, lock=True)  # lock the order before the parcel: same order as cancel
    p = orders.own_parcel(s, seller.id, parcel_id, lock=True)
    if p.status != ParcelStatus.pending:
        state = p.status.replace("_", " ")
        raise invalid_transition(f"This parcel is {state}; items can only be dropped before pickup.")
    item = next((i for i in p.items if i.id == item_id), None)
    if not item:
        raise not_found("That item isn't in this parcel.")
    if item.status == ItemStatus.dropped:
        raise invalid_transition("This item is already dropped.")

    actor = Actor.user(seller.id)
    variants = stock.lock_for(s, [item])
    item.status = ItemStatus.dropped
    stock.release(s, actor, variants[item.variant_id], item)
    last = all(i.status == ItemStatus.dropped for i in p.items)

    refunded = 0
    if order.payment_method == OrderPaymentMethod.online:
        refunded = money.refund(s, actor, order, item.line_total, item=item, parcel=p, reason=f"Item dropped: {reason}")
        if last:
            refunded += money.refund(s, actor, order, p.shipping_fee, parcel=p, reason="Parcel cancelled: shipping")
    else:
        p.cod_amount = 0 if last else max((p.cod_amount or 0) - item.line_total, 0)
    if last:
        p.status = ParcelStatus.cancelled  # a booked pickup is simply never collected
    record(
        s,
        actor,
        "seller_order",
        p.id,
        "item_dropped",
        itemId=item.id,
        reason=reason,
        note=note,
        refund=refunded,
        parcelCancelled=last,
    )
    ordering.settle_order_status(s, order)
    notifications.item_dropped(s, order.user, p, item, refunded)
    s.commit()
    return orders.own_parcel(s, seller.id, p.id)


def book_pickup(s: Session, seller: User, parcel_id: int) -> SellerOrder:
    p = orders.own_parcel(s, seller.id, parcel_id, lock=True) or _missing()
    if p.status != ParcelStatus.pending:
        raise invalid_transition(f"This parcel is {p.status.replace('_', ' ')}; a pickup can't be booked.")
    if not p.tracking_no:
        jobs.defer(s, "book_leopards_pickup", {"seller_order_id": p.id}, queueing_lock=f"book-pickup-{p.id}")
        record(s, Actor.user(seller.id), "seller_order", p.id, "pickup_requested")
    s.commit()
    return orders.own_parcel(s, seller.id, p.id)


def book_pickup_job(s: Session, parcel_id: int) -> None:
    p = orders.parcel(s, parcel_id, lock=True)
    if not p or p.status != ParcelStatus.pending or p.tracking_no:
        return
    p.tracking_no = leopards.book_pickup(p.id)
    record(s, SYSTEM, "seller_order", p.id, "pickup_booked", trackingNo=p.tracking_no)
    s.commit()


# ── Leopards webhook ───────────────────────────────────────────────────

_NEXT = {
    "picked_up": ({ParcelStatus.pending}, ParcelStatus.shipped),
    "delivered": ({ParcelStatus.shipped}, ParcelStatus.delivered),
    "refused": ({ParcelStatus.shipped}, ParcelStatus.refused),
    "delivery_failed": ({ParcelStatus.shipped}, ParcelStatus.delivery_failed),
}


def courier_event(s: Session, payload: dict[str, Any]) -> bool:
    """Apply a courier event. Status only moves forward; a repeat or out-of-order event changes nothing.

    Returns False when the tracking number is unknown.
    """
    found = orders.parcel_by_tracking(s, payload["trackingNo"])
    if not found:
        return False
    order = orders.get(s, found.order_id, lock=True)
    p = orders.parcel(s, found.id, lock=True)
    record(s, SYSTEM, "seller_order", p.id, "courier_event", payload=payload)
    allowed_from, to = _NEXT[payload["event"]]
    if p.status not in allowed_from:
        s.commit()
        return True

    p.status = to
    if to == ParcelStatus.shipped:
        p.picked_up_at = datetime.fromisoformat(payload["occurredAt"])
    elif to == ParcelStatus.delivered:
        if order.payment_method == OrderPaymentMethod.cod:
            collected = payload.get("codCollected", p.cod_amount or 0)
            money_repo.add(
                s,
                Payment(
                    order_id=order.id,
                    seller_order_id=p.id,
                    kind=PaymentKind.charge,
                    method=PaymentMethod.cod,
                    status=PaymentStatus.succeeded,
                    amount=collected,
                    provider_ref=payload["eventId"],
                ),
            )
        jobs.defer(s, "post_ledger_entries", {"seller_order_id": p.id})
    elif order.payment_method == OrderPaymentMethod.online:
        # Refused at the door or undeliverable: refund the goods (shipping was used, so it isn't refunded).
        for item in p.items:
            if item.status == ItemStatus.active:
                money.refund(s, SYSTEM, order, item.line_total, item=item, parcel=p, reason=f"Parcel {to}")
    record(s, SYSTEM, "seller_order", p.id, f"parcel_{to}")
    ordering.settle_order_status(s, order)
    notifications.parcel_update(s, order.user, p, to.value)
    s.commit()
    return True


def sandbox_courier_event(s: Session, tracking_no: str, event: str, *, seller_id: int | None) -> bool:
    """Queue a simulated courier scan. `seller_id` is the signed-in seller, who may only scan their own parcels;
    None means an admin, who may scan any. Returns False for a parcel the caller can't see."""
    p = orders.parcel_by_tracking(s, tracking_no)
    if not p or (seller_id is not None and p.seller_id != seller_id):
        return False
    jobs.defer(s, "sandbox_leopards_webhook", {"tracking_no": tracking_no, "event": event})
    s.commit()
    return True


def send_sandbox_webhook(s: Session, tracking_no: str, event: str) -> None:
    p = orders.parcel_by_tracking(s, tracking_no)
    if not p:
        return
    cod = p.cod_amount if event == "delivered" and p.order.payment_method == OrderPaymentMethod.cod else None
    status = leopards.send_webhook(get_settings().api_internal_url, leopards.webhook_body(tracking_no, event, cod))
    if status >= 300:
        raise RuntimeError(f"Leopards webhook was answered with HTTP {status}")


def _missing():
    raise not_found("That parcel doesn't exist.")
