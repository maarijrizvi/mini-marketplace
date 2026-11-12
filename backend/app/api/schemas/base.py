from datetime import datetime
from typing import Annotated, Any, TypeVar

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, PlainSerializer, WithJsonSchema
from pydantic.alias_generators import to_camel


def _to_int(v: Any) -> int:
    if isinstance(v, bool):
        raise ValueError("must be an id")
    if isinstance(v, int):
        return v
    if isinstance(v, str) and v.isdigit() and len(v) <= 19:
        return int(v)
    raise ValueError("must be an id (a string of digits)")


# bigint keys travel as strings of digits: JavaScript loses precision above 2^53.
Id = Annotated[
    int,
    BeforeValidator(_to_int),
    PlainSerializer(lambda v: str(v), return_type=str),
    WithJsonSchema({"type": "string", "pattern": "^[1-9][0-9]{0,18}$", "examples": ["10482"]}),
]
# Integer paisa: 129900 = Rs 1,299.
Money = Annotated[int, Field(ge=0, description="Paisa. 129900 = Rs 1,299.")]
SignedMoney = Annotated[int, Field(description="Paisa, may be negative.")]


class Camel(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, from_attributes=True)


class Input(Camel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid", str_strip_whitespace=True
    )


class Error(Camel):
    code: str
    message: str
    field_errors: dict[str, list[str]] | None = None
    details: dict[str, Any] | None = None


T = TypeVar("T")


class PageOf[T](Camel):
    items: list[T]
    next_cursor: str | None


Timestamp = datetime
