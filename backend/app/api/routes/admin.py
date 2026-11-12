from datetime import datetime
from typing import Annotated, Literal

from fastapi import APIRouter, Header, Query, Response

from app.api import presenters as p
from app.api.deps import DB, AdminActor
from app.api.errors import errors
from app.api.schemas.base import Id, PageOf
from app.api.schemas.catalog import CategoryInput, CategoryOut, CategoryUpdate
from app.api.schemas.identity import AdminUserView
from app.api.schemas.ops import AuditEntry, JobCounts, JobOut
from app.api.schemas.orders import (
    LedgerEntryOut,
    OrderOut,
    OrderSummary,
    PaymentOut,
    PayoutRequest,
    RequiredReasonRequest,
)
from app.data.models import (
    ActorType,
    OrderPaymentMethod,
    OrderStatus,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    SellerStatus,
)
from app.services import admin, catalog, money, ordering

router = APIRouter(prefix="/admin", tags=["Admin"], responses=errors(401))

Limit = Annotated[int, Query(ge=1, le=100)]

# ── Users and sellers ──────────────────────────────────────────────────


@router.get("/users", response_model=PageOf[AdminUserView])
def users(
    s: DB,
    _: AdminActor,
    q: Annotated[str | None, Query(description="Name, email, phone or shop name.")] = None,
    seller_status: Annotated[SellerStatus | None, Query(alias="sellerStatus")] = None,
    limit: Limit = 20,
    cursor: str | None = None,
):
    page = admin.users(s, q=q, seller_status=seller_status, limit=limit, cursor=cursor)
    return PageOf[AdminUserView](
        items=[p.admin_user(u, admin.order_count(s, u.id)) for u in page.items], next_cursor=page.next_cursor
    )


@router.get("/users/{user_id}", response_model=AdminUserView, responses=errors(404))
def user(user_id: Id, s: DB, _: AdminActor):
    u = admin.user(s, user_id)
    return p.admin_user(u, admin.order_count(s, u.id))


def _review(action: str, summary: str, needs_reason: bool):
    if needs_reason:

        def endpoint(user_id: Id, body: RequiredReasonRequest, s: DB, actor: AdminActor):
            u = admin.review_seller(s, actor, user_id, action, body.reason)
            return p.admin_user(u, admin.order_count(s, u.id))
    else:

        def endpoint(user_id: Id, s: DB, actor: AdminActor):
            u = admin.review_seller(s, actor, user_id, action)
            return p.admin_user(u, admin.order_count(s, u.id))

    router.add_api_route(
        f"/sellers/{{user_id}}/{action}",
        endpoint,
        methods=["POST"],
        response_model=AdminUserView,
        summary=summary,
        responses=errors(404, 409),
        name=f"seller_{action}",
    )


_review("approve", "Approve a pending seller", needs_reason=False)
_review("reject", "Reject a pending seller", needs_reason=True)
_review("suspend", "Suspend an approved seller (their products leave the catalogue)", needs_reason=True)
_review("reinstate", "Reinstate a suspended seller", needs_reason=False)


@router.post(
    "/sellers/{user_id}/payouts",
    tags=["Money"],
    status_code=201,
    response_model=LedgerEntryOut,
    responses={**errors(404, 409), 200: {"model": LedgerEntryOut, "description": "Replay of a key"}},
)
def payout(
    user_id: Id,
    body: PayoutRequest,
    s: DB,
    actor: AdminActor,
    response: Response,
    key: Annotated[str, Header(alias="Idempotency-Key", min_length=8, max_length=100)],
):
    """Record a payout: a negative `payout` ledger entry. The bank transfer itself happens outside the system."""
    entry, created = money.record_payout(s, actor, user_id, body.amount, body.note, key)
    if not created:
        response.status_code = 200
    return p.ledger_entry(entry)


# ── Categories ─────────────────────────────────────────────────────────


@router.post("/categories", status_code=201, response_model=CategoryOut, responses=errors(400, 409))
def create_category(body: CategoryInput, s: DB, actor: AdminActor):
    return p.category(catalog.create_category(s, actor, body.model_dump()))


@router.patch("/categories/{category_id}", response_model=CategoryOut, responses=errors(400, 404, 409))
def update_category(category_id: Id, body: CategoryUpdate, s: DB, actor: AdminActor):
    """A `variantSchema` change can add values, but can't remove a value an existing variant uses."""
    return p.category(catalog.update_category(s, actor, category_id, body.model_dump(exclude_unset=True)))


@router.delete("/categories/{category_id}", status_code=204, responses=errors(404, 409))
def delete_category(category_id: Id, s: DB, actor: AdminActor):
    catalog.delete_category(s, actor, category_id)


# ── Orders and payments ────────────────────────────────────────────────


@router.get("/orders", response_model=PageOf[OrderSummary])
def orders(
    s: DB,
    _: AdminActor,
    status: OrderStatus | None = None,
    payment_method: Annotated[OrderPaymentMethod | None, Query(alias="paymentMethod")] = None,
    q: Annotated[str | None, Query(description="Order id, customer email or tracking number.")] = None,
    limit: Limit = 20,
    cursor: str | None = None,
):
    page = ordering.search_orders(s, status=status, payment_method=payment_method, q=q, limit=limit, cursor=cursor)
    return PageOf[OrderSummary](items=[p.order_summary(o) for o in page.items], next_cursor=page.next_cursor)


@router.get("/orders/{order_id}", response_model=OrderOut, responses=errors(404))
def order(order_id: Id, s: DB, _: AdminActor):
    return p.order(ordering.any_order(s, order_id))


@router.post("/orders/{order_id}/cancel", response_model=OrderOut, responses=errors(404, 409))
def cancel_order(order_id: Id, body: RequiredReasonRequest, s: DB, actor: AdminActor):
    """Same rules and effects as the customer's cancel."""
    return p.order(ordering.cancel_by_admin(s, actor, order_id, body.reason))


@router.get("/payments", tags=["Money"], response_model=PageOf[PaymentOut])
def payments(
    s: DB,
    _: AdminActor,
    status: PaymentStatus | None = None,
    kind: PaymentKind | None = None,
    method: PaymentMethod | None = None,
    limit: Limit = 20,
    cursor: str | None = None,
):
    page = money.search_payments(s, status=status, kind=kind, method=method, limit=limit, cursor=cursor)
    return PageOf[PaymentOut](items=[p.payment(x) for x in page.items], next_cursor=page.next_cursor)


# ── Audit log and jobs ─────────────────────────────────────────────────


@router.get("/audit-log", response_model=PageOf[AuditEntry])
def audit_log(
    s: DB,
    _: AdminActor,
    entity_type: Annotated[str | None, Query(alias="entityType")] = None,
    entity_id: Annotated[Id | None, Query(alias="entityId")] = None,
    actor_type: Annotated[ActorType | None, Query(alias="actorType")] = None,
    actor_id: Annotated[Id | None, Query(alias="actorId")] = None,
    since: Annotated[datetime | None, Query(alias="from")] = None,
    until: Annotated[datetime | None, Query(alias="to")] = None,
    limit: Limit = 50,
    cursor: str | None = None,
):
    """Who changed what, newest first. Read-only."""
    page = admin.audit_log(
        s,
        entity_type=entity_type,
        entity_id=entity_id,
        actor_type=actor_type,
        actor_id=actor_id,
        since=since,
        until=until,
        limit=limit,
        cursor=cursor,
    )
    return PageOf[AuditEntry](items=[p.audit_entry(a) for a in page.items], next_cursor=page.next_cursor)


@router.get("/jobs", response_model=PageOf[JobOut])
def jobs(
    s: DB,
    _: AdminActor,
    state: Literal["queued", "running", "failed"] | None = None,
    task: str | None = None,
    limit: Limit = 20,
    cursor: str | None = None,
):
    """Background jobs. Failed ones have used up their 5 attempts."""
    page = admin.job_list(s, state=state, task=task, limit=limit, cursor=cursor)
    return PageOf[JobOut](items=[p.job(j) for j in page.items], next_cursor=page.next_cursor)


@router.get("/jobs/counts", response_model=JobCounts)
def job_counts(s: DB, _: AdminActor):
    counts = admin.job_counts(s)
    return JobCounts(queued=counts.get("todo", 0), running=counts.get("doing", 0), failed=counts.get("failed", 0))


@router.post("/jobs/{job_id}/retry", response_model=JobOut, responses=errors(404, 409))
def retry_job(job_id: Id, s: DB, actor: AdminActor):
    """Run a job again now. Safe: every job checks current state before acting."""
    return p.job(admin.retry_job(s, actor, job_id))


@router.delete("/jobs/{job_id}", status_code=204, responses=errors(404, 409))
def remove_job(job_id: Id, s: DB, actor: AdminActor):
    """Remove a job that can't succeed. Its arguments are kept in the audit log."""
    admin.remove_job(s, actor, job_id)
