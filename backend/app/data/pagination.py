"""Opaque cursors for list endpoints. Lists ordered by id use keyset paging; ranked searches use offsets."""

import base64
from dataclasses import dataclass
from typing import TypeVar

from app.core.errors import ApiError

T = TypeVar("T")


@dataclass
class Page[T]:
    items: list[T]
    next_cursor: str | None


def encode(kind: str, value: int) -> str:
    return base64.urlsafe_b64encode(f"{kind}:{value}".encode()).decode().rstrip("=")


def decode(cursor: str | None, kind: str) -> int | None:
    if not cursor:
        return None
    try:
        raw = base64.urlsafe_b64decode(cursor + "=" * (-len(cursor) % 4)).decode()
        prefix, value = raw.split(":", 1)
        if prefix != kind:
            raise ValueError
        return int(value)
    except ValueError as e:
        raise ApiError(400, "invalid_cursor", "That page link is no longer valid.") from e


def keyset_page[T](rows: list[T], limit: int, key=lambda r: r.id) -> Page[T]:
    """`rows` was fetched with limit + 1, newest id first."""
    more = len(rows) > limit
    rows = rows[:limit]
    return Page(rows, encode("i", key(rows[-1])) if more and rows else None)


def offset_page[T](rows: list[T], limit: int, offset: int) -> Page[T]:
    more = len(rows) > limit
    return Page(rows[:limit], encode("o", offset + limit) if more else None)
