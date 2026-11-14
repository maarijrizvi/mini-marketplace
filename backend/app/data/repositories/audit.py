from datetime import datetime
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.data.models import ActorType, AuditLog
from app.data.pagination import Page, decode, keyset_page


def add(
    s: Session,
    actor_type: ActorType,
    actor_id: int | None,
    entity_type: str,
    entity_id: int,
    action: str,
    data: dict[str, Any] | None = None,
) -> AuditLog:
    row = AuditLog(
        actor_type=actor_type,
        actor_id=actor_id,
        entity_type=entity_type,
        entity_id=entity_id,
        action=action,
        data=data or {},
    )
    s.add(row)
    return row


def latest_action(s: Session, entity_type: str, entity_id: int, action: str) -> AuditLog | None:
    stmt = (
        select(AuditLog)
        .where(AuditLog.entity_type == entity_type, AuditLog.entity_id == entity_id, AuditLog.action == action)
        .order_by(AuditLog.id.desc())
        .limit(1)
    )
    return s.scalar(stmt)


def find_action(s: Session, entity_type: str, action: str, key_field: str, key: str) -> AuditLog | None:
    """Look up an earlier action by a key stored in `data` (used for idempotent admin actions such as payouts)."""
    stmt = select(AuditLog).where(
        AuditLog.entity_type == entity_type, AuditLog.action == action, AuditLog.data[key_field].astext == key
    )
    return s.scalar(stmt)


def search(
    s: Session,
    *,
    entity_type: str | None,
    entity_id: int | None,
    actor_type: ActorType | None,
    actor_id: int | None,
    since: datetime | None,
    until: datetime | None,
    limit: int,
    cursor: str | None,
) -> Page[AuditLog]:
    stmt = select(AuditLog).order_by(AuditLog.id.desc()).limit(limit + 1)
    if entity_type:
        stmt = stmt.where(AuditLog.entity_type == entity_type)
    if entity_id is not None:
        stmt = stmt.where(AuditLog.entity_id == entity_id)
    if actor_type:
        stmt = stmt.where(AuditLog.actor_type == actor_type)
    if actor_id is not None:
        stmt = stmt.where(AuditLog.actor_id == actor_id)
    if since:
        stmt = stmt.where(AuditLog.created_at >= since)
    if until:
        stmt = stmt.where(AuditLog.created_at < until)
    if (after := decode(cursor, "i")) is not None:
        stmt = stmt.where(AuditLog.id < after)
    return keyset_page(list(s.scalars(stmt)), limit)
