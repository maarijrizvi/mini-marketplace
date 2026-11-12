"""Admin-only operations: reviewing sellers, reading users, the audit log and background jobs."""

from sqlalchemy.orm import Session

from app.core.errors import conflict, invalid_transition, not_found
from app.data.models import SellerStatus, User
from app.data.pagination import Page, decode, encode
from app.data.repositories import audit, identity, jobs
from app.services import notifications
from app.services.common import Actor, record

# ── Users and sellers ──────────────────────────────────────────────────


def users(s: Session, **filters) -> Page[User]:
    return identity.search_users(s, **filters)


def user(s: Session, user_id: int) -> User:
    return identity.user_by_id(s, user_id) or _missing()


def order_count(s: Session, user_id: int) -> int:
    return identity.order_count(s, user_id)


_REVIEW = {
    "approve": ({SellerStatus.pending}, SellerStatus.approved),
    "reject": ({SellerStatus.pending}, SellerStatus.rejected),
    "suspend": ({SellerStatus.approved}, SellerStatus.suspended),
    "reinstate": ({SellerStatus.suspended}, SellerStatus.approved),
}


def review_seller(s: Session, admin: Actor, user_id: int, action: str, reason: str | None = None) -> User:
    target = identity.user_by_id(s, user_id, lock=True) or _missing()
    if target.seller_status is None:
        raise invalid_transition("This user hasn't applied to sell.")
    allowed, to = _REVIEW[action]
    if target.seller_status not in allowed:
        raise invalid_transition(f"A {target.seller_status} seller can't be {to}.")
    before = target.seller_status
    target.seller_status = to
    target.seller_status_reason = reason if to in (SellerStatus.rejected, SellerStatus.suspended) else None
    target.reviewed_by = admin.id
    record(s, admin, "seller", target.id, f"seller_{action}", before=before, after=to, reason=reason)
    notifications.seller_reviewed(s, target)
    s.commit()
    return target


# ── Audit log ──────────────────────────────────────────────────────────


def audit_log(s: Session, **filters):
    return audit.search(s, **filters)


# ── Background jobs ────────────────────────────────────────────────────


def job_list(s: Session, *, state: str | None, task: str | None, limit: int, cursor: str | None) -> Page:
    rows = jobs.list_jobs(s, state=state, task=task, limit=limit, after_id=decode(cursor, "i"))
    more = len(rows) > limit
    rows = rows[:limit]
    return Page(rows, encode("i", rows[-1].id) if more and rows else None)


def job_counts(s: Session) -> dict[str, int]:
    return jobs.counts(s)


def retry_job(s: Session, admin: Actor, job_id: int):
    job = jobs.get_job(s, job_id) or _missing_job()
    if job.status == "doing":
        raise conflict("job_running", "This job is running right now.")
    jobs.retry(s, job_id)
    record(s, admin, "job", job_id, "job_retried", task=job.task, args=job.args)
    s.commit()
    return jobs.get_job(s, job_id)


def remove_job(s: Session, admin: Actor, job_id: int) -> None:
    job = jobs.get_job(s, job_id) or _missing_job()
    if job.status == "doing":
        raise conflict("job_running", "This job is running right now.")
    record(s, admin, "job", job_id, "job_removed", task=job.task, args=job.args, status=job.status)
    jobs.remove(s, job_id)
    s.commit()


def _missing():
    raise not_found("That user doesn't exist.")


def _missing_job():
    raise not_found("That job doesn't exist.")
