"""Tests run the real API against a separate Postgres database (`<name>_test`), migrated with Alembic.

Background jobs aren't run by a worker here: `run_jobs()` executes whatever was queued, in order, and the simulated
providers' webhooks are delivered through the test client instead of over the network.
"""

import os
import re
from collections.abc import Iterator

import psycopg

_base = os.environ.get("DATABASE_URL") or ""
if not _base:
    for line in open(os.path.join(os.path.dirname(__file__), "..", ".env")):
        if line.startswith("DATABASE_URL="):
            _base = line.split("=", 1)[1].strip()
TEST_URL = re.sub(r"/([^/?]+)(\?|$)", r"/\1_test\2", _base, count=1) if not _base.endswith("_test") else _base
os.environ["DATABASE_URL"] = TEST_URL
os.environ["MEDIA_DIR"] = os.path.join(os.path.dirname(__file__), ".media")
os.environ["SANDBOX_ENABLED"] = "true"

import pytest  # noqa: E402
from alembic.config import Config  # noqa: E402
from fastapi.testclient import TestClient  # noqa: E402
from sqlalchemy import text  # noqa: E402

from alembic import command  # noqa: E402
from app.core.db import SessionLocal, engine  # noqa: E402
from app.core.security import hash_password, issue_token  # noqa: E402
from app.data.models import Admin, Category, SellerStatus, User  # noqa: E402
from app.integrations import leopards, payment_gateway  # noqa: E402
from app.jobs.worker import TASKS  # noqa: E402
from app.main import app  # noqa: E402
from app.services.common import now  # noqa: E402

PASSWORD = "Secret123"


def _ensure_database() -> None:
    plain = TEST_URL.replace("postgresql+psycopg://", "postgresql://")
    admin_url, name = plain.rsplit("/", 1)
    with psycopg.connect(f"{admin_url}/postgres", autocommit=True) as conn:
        exists = conn.execute("SELECT 1 FROM pg_database WHERE datname = %s", (name,)).fetchone()
        if not exists:
            conn.execute(f'CREATE DATABASE "{name}"')
    cfg = Config(os.path.join(os.path.dirname(__file__), "..", "alembic.ini"))
    cfg.set_main_option("script_location", os.path.join(os.path.dirname(__file__), "..", "alembic"))
    command.upgrade(cfg, "head")


@pytest.fixture(scope="session", autouse=True)
def database() -> Iterator[None]:
    _ensure_database()
    yield
    engine.dispose()


@pytest.fixture(autouse=True)
def clean(database) -> Iterator[None]:
    yield
    with engine.begin() as conn:
        tables = conn.execute(
            text("SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> 'alembic_version'")
        ).scalars()
        conn.execute(text(f"TRUNCATE {', '.join(tables)} RESTART IDENTITY CASCADE"))


@pytest.fixture
def client() -> Iterator[TestClient]:
    with TestClient(app) as c:
        yield c


@pytest.fixture(autouse=True)
def route_webhooks(monkeypatch) -> None:
    """The simulated providers post their webhooks through a test client instead of the network."""

    def post(path: str):
        def send(api_base: str, body: bytes) -> int:
            from app.core.config import get_settings
            from app.core.security import sign_webhook

            secret = (
                get_settings().payment_webhook_secret if "payments" in path else get_settings().leopards_webhook_secret
            )
            with TestClient(app) as c:
                r = c.post(
                    path,
                    content=body,
                    headers={"X-Signature": sign_webhook(secret, body), "Content-Type": "application/json"},
                )
            return r.status_code

        return send

    monkeypatch.setattr(payment_gateway, "send_webhook", post("/api/v1/webhooks/payments"))
    monkeypatch.setattr(leopards, "send_webhook", post("/api/v1/webhooks/leopards"))


@pytest.fixture(autouse=True)
def no_smtp(monkeypatch) -> list[dict]:
    sent: list[dict] = []
    from app.integrations import mailer

    monkeypatch.setattr(
        mailer, "send", lambda to, subject, body: sent.append({"to": to, "subject": subject, "body": body})
    )
    return sent


def run_jobs(*, include_scheduled: bool = False, task: str | None = None) -> list[str]:
    """Run queued jobs (and any they queue) until none are left. Returns the task names run."""
    ran: list[str] = []
    for _ in range(50):
        with engine.begin() as conn:
            where = "status = 'todo'"
            if not include_scheduled:
                where += " AND (scheduled_at IS NULL OR scheduled_at <= now())"
            if task:
                where += f" AND task_name = '{task}'"
            row = conn.execute(
                text(f"SELECT id, task_name, args FROM procrastinate_jobs WHERE {where} ORDER BY id LIMIT 1")
            ).first()
            if not row:
                return ran
            conn.execute(text("UPDATE procrastinate_jobs SET status = 'succeeded' WHERE id = :id"), {"id": row.id})
        TASKS[row.task_name](**row.args)
        ran.append(row.task_name)
    raise AssertionError("jobs kept queueing more jobs")


def queued(task: str) -> list[dict]:
    with engine.begin() as conn:
        rows = conn.execute(
            text("SELECT args FROM procrastinate_jobs WHERE task_name = :t AND status = 'todo'"), {"t": task}
        ).scalars()
        return list(rows)


# ── Factories ──────────────────────────────────────────────────────────


class Factory:
    def __init__(self):
        self.n = 0

    def _next(self) -> int:
        self.n += 1
        return self.n

    def user(self, *, seller: SellerStatus | None = None, shop: str | None = None, verified: bool = True) -> User:
        n = self._next()
        with SessionLocal() as s:
            u = User(
                email=f"user{n}@example.com",
                phone="+923001234567",
                password_hash=hash_password(PASSWORD),
                first_name="Test",
                last_name=f"User{n}",
                addresses=[],
                email_verified_at=now() if verified else None,
                shop_name=(shop or f"Shop {n}") if seller else None,
                seller_status=seller,
            )
            s.add(u)
            s.commit()
            return u

    def seller(self, shop: str | None = None) -> User:
        return self.user(seller=SellerStatus.approved, shop=shop)

    def admin(self) -> Admin:
        n = self._next()
        with SessionLocal() as s:
            a = Admin(email=f"admin{n}@example.com", password_hash=hash_password(PASSWORD), full_name=f"Admin {n}")
            s.add(a)
            s.commit()
            return a

    def category(self, schema: dict | None = None, slug: str | None = None) -> Category:
        n = self._next()
        with SessionLocal() as s:
            c = Category(
                name=f"Category {n}",
                slug=slug or f"category-{n}",
                variant_schema=schema if schema is not None else {"size": ["S", "M", "L"]},
            )
            s.add(c)
            s.commit()
            return c


@pytest.fixture
def make() -> Factory:
    return Factory()


def as_user(client: TestClient, user: User) -> TestClient:
    client.cookies.set("mm_token", issue_token(user.id, "user", 60))
    return client


def as_admin(client: TestClient, admin: Admin) -> TestClient:
    client.cookies.set("mm_admin_token", issue_token(admin.id, "admin", 60))
    return client


def listed_product(client: TestClient, seller: User, category: Category, variants: list[dict], name="Linen Shirt"):
    """Create, stock and publish a product as `seller`. Returns (product_json, [variant_json])."""
    as_user(client, seller)
    r = client.post(
        "/api/v1/seller/products",
        json={
            "categoryId": str(category.id),
            "name": name,
            "description": "Soft",
            "optionNames": list(category.variant_schema)[:1],
        },
    )
    assert r.status_code == 201, r.text
    product = r.json()
    made = []
    for v in variants:
        r = client.post(f"/api/v1/seller/products/{product['id']}/variants", json=v)
        assert r.status_code == 201, r.text
        made.append(r.json())
    assert client.post(f"/api/v1/seller/products/{product['id']}/publish").status_code == 200
    client.cookies.clear()
    return product, made


ADDRESS = {
    "label": "Home",
    "recipient": "Ali Khan",
    "phone": "0300 1234567",
    "line1": "12 Clifton Block 5",
    "city": "Karachi",
}


def with_address(client: TestClient, user: User) -> str:
    as_user(client, user)
    r = client.post("/api/v1/me/addresses", json=ADDRESS)
    assert r.status_code == 201, r.text
    return r.json()["items"][0]["id"]
