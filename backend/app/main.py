"""FastAPI application: the API layer wired to the business layer. Swagger UI at /api/docs."""

import logging
from pathlib import Path

from fastapi import FastAPI
from fastapi.staticfiles import StaticFiles

from app.api import errors
from app.api.routes import admin, auth, catalog, integrations, me, seller, shopping
from app.core.config import get_settings

DESCRIPTION = """
Multi-seller marketplace: customers buy from several sellers in one checkout, each seller ships their own parcel
through Leopards Courier, and customers pay online or cash on delivery.

**Conventions**

- **IDs** are bigint keys sent as strings of digits (`"10482"`).
- **Money** is integer paisa (`129900` = Rs 1,299).
- **Errors** are `{ code, message, fieldErrors?, details? }`; `code` is stable and machine-readable.
- **Lists** use cursors: `?limit=&cursor=` returns `{ items, nextCursor }`.
- **Status changes** are action endpoints; a move the state machine doesn't allow returns `409 invalid_transition`.
- **Ownership**: a row that exists but isn't yours returns `404`.
- **Retries**: endpoints with an `Idempotency-Key` header return the first result again (`200` instead of `201`).
- **Sign-in** sets an HttpOnly cookie (`mm_token` for users, `mm_admin_token` for admins). Use *Try it out* on
  `/auth/signin` and the browser keeps the cookie for later calls.
"""


def create_app() -> FastAPI:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    settings = get_settings()
    app = FastAPI(
        title="Mini Marketplace API",
        version="1.0.0",
        description=DESCRIPTION,
        docs_url="/api/docs",
        redoc_url="/api/redoc",
        openapi_url="/api/v1/openapi.json",
        swagger_ui_parameters={"persistAuthorization": True, "docExpansion": "none", "defaultModelsExpandDepth": 0},
    )
    errors.install(app)
    for module in (auth, me, catalog, seller, shopping, admin):
        app.include_router(module.router, prefix="/api/v1")
    app.include_router(integrations.router, prefix="/api/v1")
    app.include_router(integrations.sandbox, prefix="/api/v1")
    app.include_router(integrations.health, prefix="/api/v1")

    # nginx serves /media in production; this keeps uploads visible when the API runs on its own.
    media = Path(settings.media_dir)
    media.mkdir(parents=True, exist_ok=True)
    app.mount("/media", StaticFiles(directory=media), name="media")
    return app


app = create_app()
