"""Procrastinate's job table, read and written in the caller's transaction.

Deferring through the `procrastinate_defer_jobs_v1` SQL function on the same connection means a job is queued only
if the change that caused it commits: the ERD's "a job can be added in the same transaction" rule.
"""

import json
from dataclasses import dataclass
from datetime import datetime
from typing import Any

from sqlalchemy import text
from sqlalchemy.orm import Session

QUEUE = "default"


def defer(
    s: Session,
    task_name: str,
    args: dict[str, Any],
    *,
    run_at: datetime | None = None,
    queueing_lock: str | None = None,
) -> None:
    """Queue a job. With `queueing_lock`, a second identical job is skipped while one is still waiting."""
    if queueing_lock:
        waiting = s.scalar(
            text("SELECT 1 FROM procrastinate_jobs WHERE queueing_lock = :l AND status = 'todo'"), {"l": queueing_lock}
        )
        if waiting:
            return
    s.execute(
        text(
            "SELECT procrastinate_defer_jobs_v1(ARRAY[ROW(:queue, :task, 0, NULL, :qlock, CAST(:args AS jsonb), :at)"
            "::procrastinate_job_to_defer_v1])"
        ),
        {"queue": QUEUE, "task": task_name, "qlock": queueing_lock, "args": json.dumps(args), "at": run_at},
    )


@dataclass
class JobRow:
    id: int
    task: str
    args: dict[str, Any]
    status: str
    attempts: int
    scheduled_at: datetime | None
    last_error: str | None
    created_at: datetime | None
    started_at: datetime | None


_SELECT = """
SELECT j.id, j.task_name, j.args, j.status::text, j.attempts, j.scheduled_at,
       (SELECT e.at FROM procrastinate_events e WHERE e.job_id = j.id AND e.type = 'deferred' ORDER BY e.id LIMIT 1),
       (SELECT e.at FROM procrastinate_events e WHERE e.job_id = j.id AND e.type = 'started'
        ORDER BY e.id DESC LIMIT 1)
FROM procrastinate_jobs j
"""

_STATES = {"queued": ("todo",), "running": ("doing",), "failed": ("failed",)}


def _row(r) -> JobRow:
    return JobRow(r[0], r[1], r[2], r[3], r[4], r[5], None, r[6], r[7])


def list_jobs(s: Session, *, state: str | None, task: str | None, limit: int, after_id: int | None) -> list[JobRow]:
    where, params = ["TRUE"], {"limit": limit + 1}
    if state:
        where.append("j.status::text = ANY(:statuses)")
        params["statuses"] = list(_STATES[state])
    if task:
        where.append("j.task_name = :task")
        params["task"] = task
    if after_id is not None:
        where.append("j.id < :after")
        params["after"] = after_id
    sql = f"{_SELECT} WHERE {' AND '.join(where)} ORDER BY j.id DESC LIMIT :limit"
    return [_row(r) for r in s.execute(text(sql), params)]


def get_job(s: Session, job_id: int) -> JobRow | None:
    r = s.execute(text(f"{_SELECT} WHERE j.id = :id"), {"id": job_id}).first()
    return _row(r) if r else None


def retry(s: Session, job_id: int) -> None:
    s.execute(
        text("UPDATE procrastinate_jobs SET status = 'todo', attempts = 0, scheduled_at = NULL WHERE id = :id"),
        {"id": job_id},
    )


def remove(s: Session, job_id: int) -> None:
    s.execute(text("DELETE FROM procrastinate_events WHERE job_id = :id"), {"id": job_id})
    s.execute(text("DELETE FROM procrastinate_jobs WHERE id = :id"), {"id": job_id})


def counts(s: Session) -> dict[str, int]:
    rows = s.execute(text("SELECT status::text, count(*) FROM procrastinate_jobs GROUP BY status")).all()
    return {status: n for status, n in rows}
