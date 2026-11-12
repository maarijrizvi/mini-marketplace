from dataclasses import dataclass
from datetime import UTC, datetime, timedelta, timezone
from typing import Any

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.data.models import ActorType
from app.data.repositories import audit

PKT = timezone(timedelta(hours=5), "PKT")


@dataclass(frozen=True)
class Actor:
    """Who is doing something: recorded on every audit row."""

    type: ActorType
    id: int | None = None

    @staticmethod
    def user(user_id: int) -> "Actor":
        return Actor(ActorType.user, user_id)

    @staticmethod
    def admin(admin_id: int) -> "Actor":
        return Actor(ActorType.admin, admin_id)


SYSTEM = Actor(ActorType.system)


def now() -> datetime:
    return datetime.now(UTC)


def record(s: Session, actor: Actor, entity_type: str, entity_id: int, action: str, **data: Any) -> None:
    audit.add(s, actor.type, actor.id, entity_type, entity_id, action, data)


def ship_deadline(start: datetime) -> datetime:
    """24 business hours from `start`: each 24 h step that lands on a Sunday (the day off) moves a day further."""
    hours = get_settings().ship_deadline_business_hours
    t = start
    while hours > 0:
        step = min(hours, 24)
        t += timedelta(hours=step)
        if t.astimezone(PKT).weekday() == 6:
            t += timedelta(days=1)
        hours -= step
    return t


def rupees(paisa: int) -> str:
    return f"Rs {paisa / 100:,.0f}" if paisa % 100 == 0 else f"Rs {paisa / 100:,.2f}"
