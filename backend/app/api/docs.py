"""Swagger UI, ReDoc and the OpenAPI schema, optionally behind HTTP Basic auth (DOCS_AUTH=user:password)."""

import secrets
from typing import Annotated

from fastapi import Depends, FastAPI, HTTPException
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.security import HTTPBasic, HTTPBasicCredentials

from app.core.config import get_settings

_basic = HTTPBasic(auto_error=False, realm="Mini Marketplace API docs")

SCHEMA_URL = "/api/v1/openapi.json"


def _check(credentials: Annotated[HTTPBasicCredentials | None, Depends(_basic)]) -> None:
    expected = get_settings().docs_auth
    if not expected:
        return
    user, _, password = expected.partition(":")
    ok = (
        credentials is not None
        and secrets.compare_digest(credentials.username.encode(), user.encode())
        and secrets.compare_digest(credentials.password.encode(), password.encode())
    )
    if not ok:
        raise HTTPException(
            401, "Sign in to read the API docs.", headers={"WWW-Authenticate": 'Basic realm="API docs"'}
        )


def install(app: FastAPI, swagger_parameters: dict) -> None:
    guard = [Depends(_check)]

    @app.get(SCHEMA_URL, include_in_schema=False, dependencies=guard)
    def schema():
        return app.openapi()

    @app.get("/api/docs", include_in_schema=False, dependencies=guard)
    def swagger():
        return get_swagger_ui_html(
            openapi_url=SCHEMA_URL, title=f"{app.title} – Swagger UI", swagger_ui_parameters=swagger_parameters
        )

    @app.get("/api/redoc", include_in_schema=False, dependencies=guard)
    def redoc():
        return get_redoc_html(openapi_url=SCHEMA_URL, title=f"{app.title} – ReDoc")
