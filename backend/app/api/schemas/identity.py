import re
from datetime import datetime
from typing import Annotated

from pydantic import AfterValidator, EmailStr, Field

from app.api.schemas.base import Camel, Id, Input
from app.data.models import SellerStatus


def _password(v: str) -> str:
    problems = []
    if len(v) < 8:
        problems.append("at least 8 characters")
    if not re.search(r"[A-Za-z]", v):
        problems.append("a letter")
    if not re.search(r"\d", v):
        problems.append("a number")
    if problems:
        raise ValueError("Use " + ", ".join(problems) + ".")
    return v


Password = Annotated[str, Field(max_length=128), AfterValidator(_password)]
Name = Annotated[str, Field(min_length=1, max_length=60)]
# Format is checked (with a friendly message) when the number is normalised, so only bound the length here.
Phone = Annotated[str, Field(min_length=1, max_length=30, description="Pakistani number, stored as E.164.")]
# For looking up an existing account: any address-shaped string (strict checks happen at sign-up).
LoginEmail = Annotated[str, Field(max_length=254, pattern=r"^[^@\s]+@[^@\s]+$")]


class SignUpRequest(Input):
    email: EmailStr
    password: Password
    first_name: Name
    last_name: Name
    phone: Phone


class SignInRequest(Input):
    email: LoginEmail
    password: str = Field(max_length=128)


class EmailRequest(Input):
    email: LoginEmail


class TokenRequest(Input):
    token: str = Field(max_length=2000)


class ResetPasswordRequest(Input):
    token: str = Field(max_length=2000)
    password: Password


class ChangePasswordRequest(Input):
    current_password: str = Field(max_length=128)
    new_password: Password


class ProfileUpdate(Input):
    first_name: Name | None = None
    last_name: Name | None = None
    phone: Phone | None = None


class SellerApplicationRequest(Input):
    shop_name: str = Field(min_length=2, max_length=60)


class SellerProfile(Camel):
    shop_name: str
    status: SellerStatus
    status_reason: str | None


class UserOut(Camel):
    id: Id
    email: str
    first_name: str
    last_name: str
    phone: str
    email_verified: bool
    seller: SellerProfile | None
    created_at: datetime


class UserEnvelope(Camel):
    user: UserOut


class AdminRef(Camel):
    id: Id
    full_name: str


class AdminUserView(UserOut):
    reviewed_by: AdminRef | None
    order_count: int


class AdminOut(Camel):
    id: Id
    email: str
    full_name: str
    last_login_at: datetime | None


class AdminEnvelope(Camel):
    admin: AdminOut


class AddressInput(Input):
    label: str = Field(min_length=1, max_length=30, examples=["Home"])
    recipient: str = Field(min_length=1, max_length=120)
    phone: Phone
    line1: str = Field(min_length=1, max_length=200)
    line2: str | None = Field(default=None, max_length=200)
    area: str | None = Field(default=None, max_length=100)
    city: str = Field(min_length=1, max_length=100)
    province: str | None = Field(default=None, max_length=100)
    postal_code: str | None = Field(default=None, max_length=10)


class AddressOut(Camel):
    id: str
    is_default: bool
    label: str
    recipient: str
    phone: str
    line1: str
    line2: str | None = None
    area: str | None = None
    city: str
    province: str | None = None
    postal_code: str | None = None


class AddressList(Camel):
    items: list[AddressOut]
