from datetime import datetime

from sqlalchemy import exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.data.models import (
    Order,
    OrderItem,
    OrderPaymentMethod,
    OrderStatus,
    ParcelStatus,
    Payment,
    PaymentKind,
    PaymentStatus,
    Reservation,
    SellerOrder,
    User,
)
from app.data.pagination import Page, decode, keyset_page
from app.data.text import ESCAPE, contains


def _full():
    return (
        selectinload(Order.parcels).selectinload(SellerOrder.items),
        selectinload(Order.parcels).selectinload(SellerOrder.seller),
        selectinload(Order.payments),
    )


def by_key(s: Session, user_id: int, key: str) -> Order | None:
    return s.scalar(select(Order).where(Order.user_id == user_id, Order.idempotency_key == key).options(*_full()))


def get(s: Session, order_id: int, *, user_id: int | None = None, lock: bool = False) -> Order | None:
    stmt = select(Order).where(Order.id == order_id)
    if user_id is not None:
        stmt = stmt.where(Order.user_id == user_id)
    if lock:
        # Lock the order row only; the related rows load in separate queries.
        stmt = stmt.with_for_update(of=Order)
    return s.scalar(stmt.options(*_full()))


def add(s: Session, obj):
    s.add(obj)
    s.flush()
    return obj


def list_orders(
    s: Session,
    *,
    user_id: int | None = None,
    status: OrderStatus | None = None,
    payment_method: OrderPaymentMethod | None = None,
    q: str | None = None,
    limit: int,
    cursor: str | None,
) -> Page[Order]:
    stmt = select(Order).options(selectinload(Order.parcels)).order_by(Order.id.desc()).limit(limit + 1)
    if user_id is not None:
        stmt = stmt.where(Order.user_id == user_id)
    if status:
        stmt = stmt.where(Order.status == status)
    if payment_method:
        stmt = stmt.where(Order.payment_method == payment_method)
    if q:
        conds = [
            exists().where(User.id == Order.user_id, func.lower(User.email).like(contains(q), escape=ESCAPE)),
            exists().where(SellerOrder.order_id == Order.id, SellerOrder.tracking_no == q),
        ]
        if q.isdigit():
            conds.append(Order.id == int(q))
        stmt = stmt.where(or_(*conds))
    if (after := decode(cursor, "i")) is not None:
        stmt = stmt.where(Order.id < after)
    return keyset_page(list(s.scalars(stmt)), limit)


def _paid_or_cod():
    """Orders a seller should see: COD ones, or online ones whose charge went through."""
    return or_(
        Order.payment_method == OrderPaymentMethod.cod,
        exists().where(
            Payment.order_id == Order.id,
            Payment.kind == PaymentKind.charge,
            Payment.status == PaymentStatus.succeeded,
        ),
    )


def seller_parcels(
    s: Session,
    seller_id: int,
    *,
    status: ParcelStatus | None,
    late: bool | None,
    now: datetime,
    limit: int,
    cursor: str | None,
) -> Page[SellerOrder]:
    stmt = (
        select(SellerOrder)
        .join(Order, Order.id == SellerOrder.order_id)
        .where(SellerOrder.seller_id == seller_id, _paid_or_cod())
        .options(selectinload(SellerOrder.items), selectinload(SellerOrder.order))
        .order_by(SellerOrder.id.desc())
        .limit(limit + 1)
    )
    if status:
        stmt = stmt.where(SellerOrder.status == status)
    if late:
        stmt = stmt.where(
            or_(
                (SellerOrder.picked_up_at.is_(None))
                & (SellerOrder.ship_deadline < now)
                & (SellerOrder.status == ParcelStatus.pending),
                SellerOrder.picked_up_at > SellerOrder.ship_deadline,
            )
        )
    if (after := decode(cursor, "i")) is not None:
        stmt = stmt.where(SellerOrder.id < after)
    return keyset_page(list(s.scalars(stmt)), limit)


def own_parcel(s: Session, seller_id: int, parcel_id: int, *, lock: bool = False) -> SellerOrder | None:
    stmt = (
        select(SellerOrder)
        .join(Order, Order.id == SellerOrder.order_id)
        .where(SellerOrder.id == parcel_id, SellerOrder.seller_id == seller_id, _paid_or_cod())
    )
    if lock:
        stmt = stmt.with_for_update(of=SellerOrder)
    return s.scalar(stmt.options(selectinload(SellerOrder.items), selectinload(SellerOrder.order)))


def parcel(s: Session, parcel_id: int, *, lock: bool = False) -> SellerOrder | None:
    stmt = select(SellerOrder).where(SellerOrder.id == parcel_id)
    if lock:
        stmt = stmt.with_for_update(of=SellerOrder)
    return s.scalar(stmt.options(selectinload(SellerOrder.items), selectinload(SellerOrder.order)))


def parcel_by_tracking(s: Session, tracking_no: str, *, lock: bool = False) -> SellerOrder | None:
    stmt = select(SellerOrder).where(SellerOrder.tracking_no == tracking_no)
    if lock:
        stmt = stmt.with_for_update(of=SellerOrder)
    return s.scalar(stmt.options(selectinload(SellerOrder.items), selectinload(SellerOrder.order)))


def expired_holds(s: Session, now: datetime, limit: int = 100) -> list[int]:
    """Orders still awaiting payment whose held items have passed `reserved_until`."""
    stmt = (
        select(Order.id)
        .join(SellerOrder, SellerOrder.order_id == Order.id)
        .join(OrderItem, OrderItem.seller_order_id == SellerOrder.id)
        .where(
            Order.status == OrderStatus.pending_payment,
            OrderItem.reservation == Reservation.held,
            OrderItem.reserved_until <= now,
        )
        .distinct()
        .limit(limit)
    )
    return list(s.scalars(stmt))
