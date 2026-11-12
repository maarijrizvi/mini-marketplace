"""Background jobs (Procrastinate). Each task opens its own session and calls the business layer.

Run with:  procrastinate --app=app.jobs.worker.app worker
Every task checks current state before acting, so a retry never doubles a refund, a ledger entry or a booking.
"""

import logging

from procrastinate import App, PsycopgConnector, RetryStrategy

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.integrations import mailer
from app.services import fulfilment, money, payments

log = logging.getLogger("worker")

_dsn = get_settings().database_url.replace("postgresql+psycopg://", "postgresql://")
app = App(connector=PsycopgConnector(conninfo=_dsn))

# 5 attempts with growing waits, then the job stays `failed` for an admin to retry or remove.
retry = RetryStrategy(max_attempts=5, exponential_wait=5)


def _run(fn, *args):
    with SessionLocal() as s:
        try:
            fn(s, *args)
        finally:
            s.rollback()


@app.task(name="send_email", retry=retry)
def send_email(to: str, subject: str, body: str) -> None:
    mailer.send(to, subject, body)
    log.info("email sent: %s", subject)


@app.task(name="release_expired_reservation", retry=retry)
def release_expired_reservation(order_id: int) -> None:
    _run(payments.release_expired, order_id)


@app.periodic(cron="* * * * *")
@app.task(name="sweep_expired_reservations", queueing_lock="sweep_expired_reservations")
def sweep_expired_reservations(timestamp: int) -> None:
    with SessionLocal() as s:
        released = payments.sweep_expired(s)
        if released:
            log.info("released %s expired holds", released)


@app.task(name="book_leopards_pickup", retry=retry)
def book_leopards_pickup(seller_order_id: int) -> None:
    _run(fulfilment.book_pickup_job, seller_order_id)


@app.task(name="issue_refund", retry=retry)
def issue_refund(payment_id: int) -> None:
    _run(payments.issue_refund, payment_id)


@app.task(name="post_ledger_entries", retry=retry)
def post_ledger_entries(seller_order_id: int) -> None:
    _run(money.post_parcel_entries, seller_order_id)


@app.task(name="sandbox_payment_webhook", retry=retry)
def sandbox_payment_webhook(payment_id: int, outcome: str) -> None:
    _run(payments.send_sandbox_webhook, payment_id, outcome)


@app.task(name="sandbox_leopards_webhook", retry=retry)
def sandbox_leopards_webhook(tracking_no: str, event: str) -> None:
    _run(fulfilment.send_sandbox_webhook, tracking_no, event)


# Plain-Python view of the tasks, so tests can run queued jobs without a worker process.
TASKS = {
    "send_email": send_email,
    "release_expired_reservation": release_expired_reservation,
    "book_leopards_pickup": book_leopards_pickup,
    "issue_refund": issue_refund,
    "post_ledger_entries": post_ledger_entries,
    "sandbox_payment_webhook": sandbox_payment_webhook,
    "sandbox_leopards_webhook": sandbox_leopards_webhook,
}
