"""The only code that moves stock. Callers must hold row locks on the variants (see `lock_for`).

held      → reserved += q              (online checkout, until paid or `reserved_until`)
committed → on_hand −= q, reserved −= q (paid, or a COD order placed)
released  → held: reserved −= q;  committed: on_hand += q  (failed, expired, cancelled or dropped)
"""

from sqlalchemy.orm import Session

from app.data.models import OrderItem, ProductVariant, Reservation
from app.data.repositories import catalog
from app.services.common import Actor, record


def lock_for(s: Session, items: list[OrderItem]) -> dict[int, ProductVariant]:
    return catalog.lock_variants(s, [i.variant_id for i in items])


def hold(s: Session, actor: Actor, variant: ProductVariant, item: OrderItem) -> None:
    variant.reserved += item.quantity
    item.reservation = Reservation.held
    _log(s, actor, variant, "stock_held", item)


def commit(s: Session, actor: Actor, variant: ProductVariant, item: OrderItem) -> None:
    if item.reservation != Reservation.held:
        return
    variant.reserved -= item.quantity
    variant.on_hand -= item.quantity
    item.reservation = Reservation.committed
    _log(s, actor, variant, "stock_committed", item)


def release(s: Session, actor: Actor, variant: ProductVariant, item: OrderItem) -> None:
    if item.reservation == Reservation.held:
        variant.reserved -= item.quantity
    elif item.reservation == Reservation.committed:
        variant.on_hand += item.quantity
    else:
        return
    item.reservation = Reservation.released
    _log(s, actor, variant, "stock_released", item)


def _log(s: Session, actor: Actor, variant: ProductVariant, action: str, item: OrderItem) -> None:
    record(
        s,
        actor,
        "variant",
        variant.id,
        action,
        quantity=item.quantity,
        orderItemId=item.id,
        onHand=variant.on_hand,
        reserved=variant.reserved,
    )
