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


def friendly(err: dict) -> str:
    """Pydantic's error in words a shopper understands ("Enter at least 2 characters." not "String should…")."""
    ctx = err.get("ctx") or {}
    kind = err["type"]
    if kind == "missing":
        return "This is required."
    if kind == "string_too_short":
        n = ctx.get("min_length", 1)
        return "This can't be empty." if n <= 1 else f"Enter at least {n} characters."
    if kind == "string_too_long":
        return f"Use at most {ctx.get('max_length')} characters."
    if kind in ("int_parsing", "int_type", "float_parsing", "int_from_float"):
        return "Enter a whole number."
    if kind in ("greater_than", "greater_than_equal"):
        limit = ctx.get("gt", ctx.get("ge"))
        return "Enter a number above 0." if limit == 0 and kind == "greater_than" else f"Enter {limit} or more."
    if kind in ("less_than", "less_than_equal"):
        return f"Enter {ctx.get('lt', ctx.get('le'))} or less."
    if kind == "string_pattern_mismatch":
        return "That format isn't valid."
    if kind == "value_error" and "email" in err["msg"].lower():
        return "Enter a valid email address."
    if kind == "literal_error" or kind == "enum":
        return "Choose one of the options."
    if kind == "extra_forbidden":
        return "This field isn't allowed."
    return err["msg"].removeprefix("Value error, ")


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
        errs = e.errors()
        # A malformed id in the URL (/products/abc) is just a page that doesn't exist.
        if any(err["loc"][:1] == ("path",) for err in errs):
            return JSONResponse(_body("not_found", "That page doesn't exist."), status_code=404)
        fields: dict[str, list[str]] = {}
        for err in errs:
            loc = [str(x) for x in err["loc"] if x not in ("body", "query", "path", "header", "cookie")]
            field = ".".join(to_camel(x) if not x.isdigit() else x for x in loc) or "body"
            fields.setdefault(field, []).append(friendly(err))
        # A bad search or filter value has no form to point at, so say what was wrong in the message itself.
        only_query = all(err["loc"][:1] == ("query",) for err in errs)
        message = next(iter(fields.values()))[0] if only_query else "Some fields need attention."
        return JSONResponse(_body("validation_failed", message, fields), status_code=400)

    @app.exception_handler(HTTPException)
    async def http_error(_: Request, e: HTTPException):
        code = {401: "unauthenticated", 404: "not_found", 405: "method_not_allowed"}.get(e.status_code, "http_error")
        return JSONResponse(_body(code, str(e.detail)), status_code=e.status_code, headers=getattr(e, "headers", None))
