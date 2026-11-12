from typing import Any


class ApiError(Exception):
    """A business-rule failure with a stable machine-readable code.

    Raised by the business layer; the API layer turns it into `{code, message, fieldErrors?, details?}`.
    """

    def __init__(
        self,
        status: int,
        code: str,
        message: str,
        field_errors: dict[str, list[str]] | None = None,
        details: dict[str, Any] | None = None,
    ):
        super().__init__(message)
        self.status = status
        self.code = code
        self.message = message
        self.field_errors = field_errors
        self.details = details


def not_found(what: str = "Not found.") -> ApiError:
    return ApiError(404, "not_found", what)


def invalid_transition(message: str) -> ApiError:
    return ApiError(409, "invalid_transition", message)


def conflict(code: str, message: str, **details: Any) -> ApiError:
    return ApiError(409, code, message, details=details or None)


def field_error(field: str, message: str, code: str = "validation_failed") -> ApiError:
    return ApiError(400, code, message, field_errors={field: [message]})
