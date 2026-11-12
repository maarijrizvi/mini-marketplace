from datetime import datetime
from typing import Any, Literal

from pydantic import Field

from app.api.schemas.base import Camel, Id, Input, Money
from app.data.models import ActorType

LeopardsEvent = Literal["picked_up", "delivered", "refused", "delivery_failed"]


class AuditEntry(Camel):
    id: Id
    actor_type: ActorType
    actor_id: Id | None
    entity_type: str
    entity_id: Id
    action: str
    data: dict[str, Any]
    created_at: datetime


class JobOut(Camel):
    id: Id
    task: str
    args: dict[str, Any]
    status: Literal["queued", "running", "succeeded", "failed", "cancelled", "aborted"]
    attempts: int
    scheduled_at: datetime | None
    created_at: datetime | None
    started_at: datetime | None


class JobCounts(Camel):
    queued: int
    running: int
    failed: int


class PaymentWebhook(Camel):
    event_id: str
    provider_ref: str
    payment_id: Id
    kind: Literal["charge", "refund"]
    status: Literal["succeeded", "failed"]
    failure_reason: str | None = None


class LeopardsWebhook(Camel):
    event_id: str
    tracking_no: str
    event: LeopardsEvent
    occurred_at: datetime
    cod_collected: Money | None = None


class SandboxPaymentComplete(Input):
    outcome: Literal["succeeded", "failed", "no_answer"] = Field(
        description="`no_answer` sends no webhook, to test the hold expiring."
    )


class SandboxPaymentView(Camel):
    payment_id: Id
    order_id: Id
    amount: Money
    method: str
    status: str


class SandboxCourierEvent(Input):
    event: LeopardsEvent
