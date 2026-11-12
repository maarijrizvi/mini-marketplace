"""Error responses: the `{code, message, fieldErrors?, details?}` shape for every failure."""

from fastapi import FastAPI, Request
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from pydantic.alias_generators import to_camel
from starlette.exceptions import HTTPException

from app.api.schemas.base import Error
from app.core.errors import ApiError

_DESCRIPTIONS = {
    400: "Validation failed or a bad link (`validation_failed`, `invalid_token`, …)",
    401: "`unauthenticated` or `invalid_credentials`",
    403: "`not_approved_seller` or `email_not_verified`",
    404: "`not_found` (also for rows that exist but aren't yours)",
    409: "A business rule refused it (`invalid_transition`, `insufficient_stock`, …)",
    429: "`rate_limited`",
}


def errors(*codes: int) -> dict:
    """OpenAPI `responses` entries for the listed error statuses."""
    return {code: {"model": Error, "description": _DESCRIPTIONS.get(code, "Error")} for code in codes}


def _body(code: str, message: str, field_errors=None, details=None) -> dict:
    out = {"code": code, "message": message}
    if field_errors:
        out["fieldErrors"] = field_errors
    if details:
        out["details"] = details
    return out


def install(app: FastAPI) -> None:
    @app.exception_handler(ApiError)
    async def api_error(_: Request, e: ApiError):
        headers = {"Retry-After": str(e.details["retryAfter"])} if e.status == 429 and e.details else None
        return JSONResponse(_body(e.code, e.message, e.field_errors, e.details), status_code=e.status, headers=headers)

    @app.exception_handler(RequestValidationError)
    async def validation_error(_: Request, e: RequestValidationError):
        fields: dict[str, list[str]] = {}
        for err in e.errors():
            loc = [str(x) for x in err["loc"] if x not in ("body", "query", "path", "header", "cookie")]
            field = ".".join(to_camel(x) if not x.isdigit() else x for x in loc) or "body"
            message = err["msg"].removeprefix("Value error, ")
            fields.setdefault(field, []).append(message)
        return JSONResponse(_body("validation_failed", "Some fields need attention.", fields), status_code=400)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, e: HTTPException):
        code = {404: "not_found", 405: "method_not_allowed"}.get(e.status_code, "http_error")
        return JSONResponse(_body(code, str(e.detail)), status_code=e.status_code)
