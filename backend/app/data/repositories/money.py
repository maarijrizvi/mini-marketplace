from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.data.models import (
    LedgerEntryType,
    Payment,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    SellerLedgerEntry,
)
from app.data.pagination import Page, decode, keyset_page

# ── Payments ───────────────────────────────────────────────────────────


def add(s: Session, obj):
    s.add(obj)
    s.flush()
    return obj


def payment(s: Session, payment_id: int, *, lock: bool = False) -> Payment | None:
    stmt = select(Payment).where(Payment.id == payment_id)
    return s.scalar(stmt.with_for_update() if lock else stmt)


def payment_by_ref(s: Session, provider_ref: str) -> Payment | None:
    return s.scalar(select(Payment).where(Payment.provider_ref == provider_ref))


def succeeded_charge(s: Session, order_id: int) -> Payment | None:
    stmt = select(Payment).where(
        Payment.order_id == order_id,
        Payment.kind == PaymentKind.charge,
        Payment.method != PaymentMethod.cod,
        Payment.status == PaymentStatus.succeeded,
    )
    return s.scalar(stmt)


def refunded_total(s: Session, charge_id: int) -> int:
    """Refunds already succeeded or still on their way, so the same money is never refunded twice."""
    stmt = select(func.coalesce(func.sum(Payment.amount), 0)).where(
        Payment.refund_of == charge_id,
        Payment.kind == PaymentKind.refund,
        Payment.status != PaymentStatus.failed,
    )
    return int(s.scalar(stmt))


def search_payments(
    s: Session,
    *,
    status: PaymentStatus | None,
    kind: PaymentKind | None,
    method: PaymentMethod | None,
    limit: int,
    cursor: str | None,
) -> Page[Payment]:
    stmt = select(Payment).order_by(Payment.id.desc()).limit(limit + 1)
    if status:
        stmt = stmt.where(Payment.status == status)
    if kind:
        stmt = stmt.where(Payment.kind == kind)
    if method:
        stmt = stmt.where(Payment.method == method)
    if (after := decode(cursor, "i")) is not None:
        stmt = stmt.where(Payment.id < after)
    return keyset_page(list(s.scalars(stmt)), limit)


# ── Seller ledger ──────────────────────────────────────────────────────


def balance(s: Session, seller_id: int) -> int:
    stmt = select(func.coalesce(func.sum(SellerLedgerEntry.amount), 0)).where(SellerLedgerEntry.seller_id == seller_id)
    return int(s.scalar(stmt))


def has_entry(s: Session, seller_order_id: int, entry_type: LedgerEntryType) -> bool:
    stmt = (
        select(func.count())
        .select_from(SellerLedgerEntry)
        .where(SellerLedgerEntry.seller_order_id == seller_order_id, SellerLedgerEntry.entry_type == entry_type)
    )
    return s.scalar(stmt) > 0


def ledger(
    s: Session, seller_id: int, *, entry_type: LedgerEntryType | None, limit: int, cursor: str | None
) -> Page[SellerLedgerEntry]:
    stmt = (
        select(SellerLedgerEntry)
        .where(SellerLedgerEntry.seller_id == seller_id)
        .order_by(SellerLedgerEntry.id.desc())
        .limit(limit + 1)
    )
    if entry_type:
        stmt = stmt.where(SellerLedgerEntry.entry_type == entry_type)
    if (after := decode(cursor, "i")) is not None:
        stmt = stmt.where(SellerLedgerEntry.id < after)
    return keyset_page(list(s.scalars(stmt)), limit)


def ledger_entry(s: Session, entry_id: int) -> SellerLedgerEntry | None:
    return s.get(SellerLedgerEntry, entry_id)
