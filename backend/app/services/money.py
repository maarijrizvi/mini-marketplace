"""Money movements: refunds to customers (`payments`) and the seller ledger (`seller_ledger`)."""

from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, not_found
from app.data.models import (
    LedgerEntryType,
    Order,
    OrderItem,
    ParcelStatus,
    Payment,
    PaymentKind,
    PaymentStatus,
    SellerLedgerEntry,
    SellerOrder,
    User,
)
from app.data.pagination import Page
from app.data.repositories import audit, identity, jobs, orders
from app.data.repositories import money as repo
from app.integrations import payment_gateway
from app.services.common import Actor, record

# ── Refunds ────────────────────────────────────────────────────────────


def refund(
    s: Session,
    actor: Actor,
    order: Order,
    amount: int,
    *,
    item: OrderItem | None = None,
    parcel: SellerOrder | None = None,
    reason: str,
) -> int:
    """Queue a refund against the order's online charge. Never refunds more than is left of the charge.

    Returns the amount actually queued (0 for COD or unpaid orders).
    """
    charge = repo.succeeded_charge(s, order.id)
    if not charge or amount <= 0:
        return 0
    amount = min(amount, charge.amount - repo.refunded_total(s, charge.id))
    if amount <= 0:
        return 0
    row = repo.add(
        s,
        Payment(
            order_id=order.id,
            seller_order_id=parcel.id if parcel else None,
            order_item_id=item.id if item else None,
            refund_of=charge.id,
            kind=PaymentKind.refund,
            method=charge.method,
            status=PaymentStatus.pending,
            amount=amount,
            provider_ref=payment_gateway.new_reference("rf"),
        ),
    )
    record(s, actor, "payment", row.id, "refund_requested", amount=amount, reason=reason, orderId=order.id)
    jobs.defer(s, "issue_refund", {"payment_id": row.id})
    return amount


# ── Seller ledger ──────────────────────────────────────────────────────


def post_parcel_entries(s: Session, parcel_id: int) -> None:
    """Sale (+) and commission (−) for a delivered parcel, from the item snapshots. Safe to run twice."""
    parcel = orders.parcel(s, parcel_id, lock=True)
    if not parcel or parcel.status != ParcelStatus.delivered:
        return
    active = [i for i in parcel.items if i.status == "active"]
    sale = sum(i.line_total for i in active)
    commission = sum(round(i.line_total * i.commission_bps / 10_000) for i in active)
    for entry_type, amount in ((LedgerEntryType.sale, sale), (LedgerEntryType.commission, -commission)):
        if repo.has_entry(s, parcel.id, entry_type):
            continue
        try:
            with s.begin_nested():
                repo.add(
                    s,
                    SellerLedgerEntry(
                        seller_id=parcel.seller_id, seller_order_id=parcel.id, entry_type=entry_type, amount=amount
                    ),
                )
        except IntegrityError:
            continue  # another run posted it first (unique index on parcel + entry type)
    s.commit()


def balance(s: Session, seller: User) -> int:
    return repo.balance(s, seller.id)


def ledger(s: Session, seller: User, **filters) -> Page[SellerLedgerEntry]:
    return repo.ledger(s, seller.id, **filters)


def record_payout(
    s: Session, admin: Actor, seller_id: int, amount: int, note: str | None, idempotency_key: str
) -> tuple[SellerLedgerEntry, bool]:
    """Returns (entry, created). The bank transfer itself happens outside the system."""
    seller = identity.user_by_id(s, seller_id, lock=True)  # serialises payouts for one seller
    if not seller:
        raise not_found("That user doesn't exist.")
    earlier = audit.find_action(s, "seller", "payout_recorded", "idempotencyKey", idempotency_key)
    if earlier:
        return repo.ledger_entry(s, earlier.data["entryId"]), False
    if not seller.shop_name:
        raise conflict("not_a_seller", "This user doesn't have a shop.")
    available = repo.balance(s, seller.id)
    if amount > available:
        raise ApiError(
            409, "insufficient_balance", "The payout is more than the seller's balance.", details={"balance": available}
        )
    entry = repo.add(s, SellerLedgerEntry(seller_id=seller.id, entry_type=LedgerEntryType.payout, amount=-amount))
    record(
        s,
        admin,
        "seller",
        seller.id,
        "payout_recorded",
        entryId=entry.id,
        amount=amount,
        note=note,
        idempotencyKey=idempotency_key,
    )
    s.commit()
    return entry, True


def search_payments(s: Session, **filters) -> Page[Payment]:
    return repo.search_payments(s, **filters)
