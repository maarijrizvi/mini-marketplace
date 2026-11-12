"""Checkout and the order lifecycle shared by customers, sellers, admins, webhooks and jobs."""

from dataclasses import dataclass
from datetime import timedelta

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.core.errors import ApiError, invalid_transition, not_found
from app.data.models import (
    PARCEL_FINAL,
    ItemStatus,
    Order,
    OrderItem,
    OrderPaymentMethod,
    OrderStatus,
    ParcelStatus,
    Payment,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    ProductVariant,
    Reservation,
    SellerOrder,
    User,
)
from app.data.pagination import Page
from app.data.repositories import cart as cart_repo
from app.data.repositories import catalog, jobs, orders
from app.integrations import payment_gateway
from app.services import money, notifications, stock
from app.services.cart import CartView, Line, view
from app.services.common import SYSTEM, Actor, now, record, ship_deadline
from app.services.identity import find_address

# ── Quote ──────────────────────────────────────────────────────────────


@dataclass
class QuoteParcel:
    seller: User
    lines: list[Line]
    shipping_fee: int

    @property
    def items_total(self) -> int:
        return sum(line.line_total for line in self.lines)

    @property
    def total(self) -> int:
        return self.items_total + self.shipping_fee


@dataclass
class Quote:
    parcels: list[QuoteParcel]

    @property
    def items_total(self) -> int:
        return sum(p.items_total for p in self.parcels)

    @property
    def shipping_total(self) -> int:
        return sum(p.shipping_fee for p in self.parcels)

    @property
    def total(self) -> int:
        return self.items_total + self.shipping_total


def _build_quote(cart: CartView) -> Quote:
    fee = get_settings().shipping_fee_per_parcel
    parcels = []
    for group in cart.groups:
        lines = [line for line in group.lines if line.item.selected]
        if lines:
            parcels.append(QuoteParcel(group.seller, lines, fee))
    if not parcels:
        raise ApiError(409, "nothing_selected", "Tick at least one item in your cart.")
    unavailable = [line for p in parcels for line in p.lines if not line.sellable]
    if unavailable:
        raise ApiError(
            409,
            "variant_unavailable",
            "Some items are no longer for sale. Remove them to continue.",
            details={"variantIds": [str(line.variant.id) for line in unavailable]},
        )
    short = [line for p in parcels for line in p.lines if not line.purchasable]
    if short:
        raise ApiError(
            409,
            "insufficient_stock",
            "Some items don't have enough stock left.",
            details={"items": [{"variantId": str(line.variant.id), "available": line.available} for line in short]},
        )
    return Quote(parcels)


def quote(s: Session, user: User, address_id: str) -> Quote:
    find_address(user, address_id)
    return _build_quote(view(s, user, selected_only=True))


# ── Checkout ───────────────────────────────────────────────────────────


@dataclass
class CheckoutResult:
    order: Order
    payment: Payment | None
    created: bool


def checkout(
    s: Session, user: User, *, address_id: str, payment_method: PaymentMethod, expected_total: int, key: str
) -> CheckoutResult:
    existing = orders.by_key(s, user.id, key)
    if existing:
        return _replay(existing, address_id, payment_method)

    address = find_address(user, address_id)
    lines = cart_repo.lines(s, user.id, selected_only=True)
    # Lock every variant being bought, in id order, before reading stock: the oversell guard.
    locked = catalog.lock_variants(s, [i.variant_id for i in lines])
    # A duplicate request that waited on those locks finds the winner's order now (and an emptied cart).
    existing = orders.by_key(s, user.id, key)
    if existing:
        s.rollback()
        return _replay(existing, address_id, payment_method)
    q = _build_quote(view(s, user, selected_only=True))
    if q.total != expected_total:
        raise ApiError(
            409,
            "prices_changed",
            "Prices or availability changed since you last looked. Check the new total.",
            details={"total": q.total},
        )

    online = payment_method != PaymentMethod.cod
    started = now()
    settings = get_settings()
    order = Order(
        user_id=user.id,
        idempotency_key=key,
        payment_method=OrderPaymentMethod.online if online else OrderPaymentMethod.cod,
        status=OrderStatus.pending_payment if online else OrderStatus.placed,
        total=q.total,
        shipping_address={k: v for k, v in address.items()},
    )
    try:
        orders.add(s, order)
    except IntegrityError:
        # Same key sent twice at once: the other request won. Return its order.
        s.rollback()
        existing = orders.by_key(s, user.id, key)
        if existing:
            return _replay(existing, address_id, payment_method)
        raise

    actor = Actor.user(user.id)
    hold_until = started + timedelta(minutes=settings.reservation_minutes) if online else None
    for qp in q.parcels:
        parcel = orders.add(
            s,
            SellerOrder(
                order_id=order.id,
                seller_id=qp.seller.id,
                status=ParcelStatus.pending,
                shipping_fee=qp.shipping_fee,
                cod_amount=None if online else qp.total,
                ship_deadline=ship_deadline(started),
            ),
        )
        for line in qp.lines:
            variant: ProductVariant = locked[line.variant.id]
            item = orders.add(
                s,
                OrderItem(
                    seller_order_id=parcel.id,
                    variant_id=variant.id,
                    product_name=variant.product.name,
                    options=dict(variant.options),
                    unit_price=variant.price,
                    quantity=line.item.quantity,
                    commission_bps=settings.commission_bps,
                    status=ItemStatus.active,
                    reservation=Reservation.held,
                    reserved_until=hold_until,
                ),
            )
            stock.hold(s, actor, variant, item)
            if not online:
                stock.commit(s, actor, variant, item)

    cart_repo.remove_variants(s, user.id, [line.variant.id for p in q.parcels for line in p.lines])

    payment = None
    if online:
        payment = orders.add(
            s,
            Payment(
                order_id=order.id,
                kind=PaymentKind.charge,
                method=payment_method,
                status=PaymentStatus.pending,
                amount=q.total,
                provider_ref=payment_gateway.new_reference(),
            ),
        )
        jobs.defer(s, "release_expired_reservation", {"order_id": order.id}, run_at=hold_until)
    record(
        s,
        actor,
        "order",
        order.id,
        "placed" if not online else "awaiting_payment",
        total=q.total,
        paymentMethod=payment_method.value,
    )
    s.flush()
    order = orders.get(s, order.id)
    if not online:
        notifications.order_placed(s, user, order)
    s.commit()
    return CheckoutResult(order, payment, True)


def _replay(order: Order, address_id: str, method: PaymentMethod) -> CheckoutResult:
    same_method = (order.payment_method == OrderPaymentMethod.cod) == (method == PaymentMethod.cod)
    if order.shipping_address.get("id") != address_id or not same_method:
        raise ApiError(409, "idempotency_key_reused", "This checkout was already submitted with different details.")
    charge = next((p for p in order.payments if p.kind == PaymentKind.charge), None)
    return CheckoutResult(order, charge, False)


# ── Reading orders ─────────────────────────────────────────────────────


def my_orders(s: Session, user: User, **filters) -> Page[Order]:
    return orders.list_orders(s, user_id=user.id, **filters)


def my_order(s: Session, user: User, order_id: int) -> Order:
    return orders.get(s, order_id, user_id=user.id) or _missing()


def any_order(s: Session, order_id: int) -> Order:
    return orders.get(s, order_id) or _missing()


def search_orders(s: Session, **filters) -> Page[Order]:
    return orders.list_orders(s, **filters)


# ── Cancelling ─────────────────────────────────────────────────────────


def cancel_by_customer(s: Session, user: User, order_id: int, reason: str | None) -> Order:
    order = orders.get(s, order_id, user_id=user.id, lock=True) or _missing()
    return _cancel(s, Actor.user(user.id), order, reason or "Cancelled by the customer")


def cancel_by_admin(s: Session, admin: Actor, order_id: int, reason: str) -> Order:
    order = orders.get(s, order_id, lock=True) or _missing()
    return _cancel(s, admin, order, reason)


def _cancel(s: Session, actor: Actor, order: Order, reason: str) -> Order:
    if order.status not in (OrderStatus.pending_payment, OrderStatus.placed):
        raise invalid_transition(f"This order is {order.status.replace('_', ' ')} and can't be cancelled.")
    if any(p.status not in (ParcelStatus.pending, ParcelStatus.cancelled) for p in order.parcels):
        raise invalid_transition("A parcel has already been picked up, so the order can't be cancelled.")
    release_all(s, actor, order)
    order.status = OrderStatus.cancelled
    refunded = money.refund(s, actor, order, order.total, reason=reason)
    record(s, actor, "order", order.id, "cancelled", reason=reason, refund=refunded)
    notifications.order_cancelled(s, order.user, order, refunded)
    s.commit()
    return orders.get(s, order.id)


def release_all(s: Session, actor: Actor, order: Order) -> None:
    """Release every item's stock and cancel every parcel still pending (variants locked in id order)."""
    items = [i for p in order.parcels for i in p.items]
    variants = stock.lock_for(s, items)
    for parcel in order.parcels:
        for item in parcel.items:
            stock.release(s, actor, variants[item.variant_id], item)
        if parcel.status == ParcelStatus.pending:
            parcel.status = ParcelStatus.cancelled
            if parcel.cod_amount is not None:
                parcel.cod_amount = 0


def settle_order_status(s: Session, order: Order) -> None:
    """After a parcel changes: every parcel cancelled → order cancelled; every parcel final → completed."""
    if order.status not in (OrderStatus.placed,):
        return
    statuses = {p.status for p in order.parcels}
    if statuses == {ParcelStatus.cancelled}:
        order.status = OrderStatus.cancelled
        record(s, SYSTEM, "order", order.id, "cancelled", reason="Every parcel was cancelled")
    elif statuses <= PARCEL_FINAL:
        order.status = OrderStatus.completed
        record(s, SYSTEM, "order", order.id, "completed")


def _missing():
    raise not_found("That order doesn't exist.")
