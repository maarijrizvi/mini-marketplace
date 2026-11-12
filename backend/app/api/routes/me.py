from fastapi import APIRouter

from app.api import presenters as p
from app.api.deps import DB, CurrentUser
from app.api.errors import errors
from app.api.schemas.identity import (
    AddressInput,
    AddressList,
    ChangePasswordRequest,
    ProfileUpdate,
    SellerApplicationRequest,
    UserEnvelope,
)
from app.services import identity

router = APIRouter(tags=["Me"], responses=errors(401))


@router.get("/me", response_model=UserEnvelope)
def me(user: CurrentUser):
    return UserEnvelope(user=p.user(user))


@router.patch("/me", response_model=UserEnvelope, responses=errors(400))
def update_me(body: ProfileUpdate, user: CurrentUser, s: DB):
    """Update name or phone. Never changes email or seller fields."""
    return UserEnvelope(user=p.user(identity.update_profile(s, user, body.model_dump(exclude_unset=True))))


@router.post("/me/password", status_code=204, responses=errors(400))
def change_password(body: ChangePasswordRequest, user: CurrentUser, s: DB):
    identity.change_password(s, user, body.current_password, body.new_password)


@router.get("/me/addresses", response_model=AddressList)
def addresses(user: CurrentUser):
    """Saved addresses, default first."""
    return p.addresses(user.addresses)


@router.post("/me/addresses", status_code=201, response_model=AddressList, responses=errors(400))
def add_address(body: AddressInput, user: CurrentUser, s: DB):
    return p.addresses(identity.add_address(s, user, body.model_dump()))


@router.patch("/me/addresses/{address_id}", response_model=AddressList, responses=errors(400, 404))
def update_address(address_id: str, body: AddressInput, user: CurrentUser, s: DB):
    """Edit an address. Past orders keep their own copy."""
    return p.addresses(identity.update_address(s, user, address_id, body.model_dump()))


@router.delete("/me/addresses/{address_id}", response_model=AddressList, responses=errors(404))
def remove_address(address_id: str, user: CurrentUser, s: DB):
    return p.addresses(identity.remove_address(s, user, address_id))


@router.post("/me/addresses/{address_id}/default", response_model=AddressList, responses=errors(404))
def make_default(address_id: str, user: CurrentUser, s: DB):
    """Moves the address to the front of the list."""
    return p.addresses(identity.make_default_address(s, user, address_id))


@router.post("/me/seller-application", response_model=UserEnvelope, responses=errors(400, 409))
def apply_to_sell(body: SellerApplicationRequest, user: CurrentUser, s: DB):
    """Apply to sell: sets `shop_name` and `seller_status` = pending. Allowed again after a rejection."""
    return UserEnvelope(user=p.user(identity.apply_to_sell(s, user, body.shop_name)))
