from typing import Annotated

from fastapi import APIRouter, Header, Query, Response

from app.api import presenters as p
from app.api.deps import DB, CurrentUser
from app.api.errors import errors
from app.api.schemas.base import Id, PageOf
from app.api.schemas.orders import (
    AddToCartRequest,
    Cart,
    CartItemUpdate,
    CartSelectionRequest,
    CheckoutRequest,
    CheckoutResult,
    OrderOut,
    OrderSummary,
    PaymentRedirect,
    Quote,
    QuoteRequest,
    ReasonRequest,
)
from app.data.models import OrderStatus
from app.integrations import payment_gateway
from app.services import cart, ordering

router = APIRouter(responses=errors(401))

IdempotencyKey = Annotated[
    str,
    Header(
        alias="Idempotency-Key",
        min_length=8,
        max_length=100,
        description="One key per checkout attempt, reused on retry.",
    ),
]

# ── Cart ───────────────────────────────────────────────────────────────


@router.get("/me/cart", tags=["Cart"], response_model=Cart)
def get_cart(user: CurrentUser, s: DB):
    """The cart, grouped by seller. Prices are read live from the variants."""
    return p.cart(cart.view(s, user))


@router.post("/me/cart/items", tags=["Cart"], response_model=Cart, responses=errors(400, 409))
def add_item(body: AddToCartRequest, user: CurrentUser, s: DB):
    """Add a variant. If it's already in the cart its quantity goes up. New lines start ticked."""
    return p.cart(cart.add(s, user, body.variant_id, body.quantity))


@router.patch("/me/cart/items/{variant_id}", tags=["Cart"], response_model=Cart, responses=errors(400, 404, 409))
def update_item(variant_id: Id, body: CartItemUpdate, user: CurrentUser, s: DB):
    return p.cart(cart.update(s, user, variant_id, body.quantity, body.selected))


@router.delete("/me/cart/items/{variant_id}", tags=["Cart"], response_model=Cart, responses=errors(404))
def remove_item(variant_id: Id, user: CurrentUser, s: DB):
    return p.cart(cart.remove(s, user, variant_id))


@router.post("/me/cart/selection", tags=["Cart"], response_model=Cart, responses=errors(400))
def select(body: CartSelectionRequest, user: CurrentUser, s: DB):
    """Tick or untick many lines (all of them when `variantIds` is omitted)."""
    return p.cart(cart.select(s, user, body.selected, body.variant_ids))


# ── Checkout ───────────────────────────────────────────────────────────


@router.post("/checkout/quote", tags=["Checkout"], response_model=Quote, responses=errors(404, 409))
def quote(body: QuoteRequest, user: CurrentUser, s: DB):
    """Price the ticked lines: one parcel per seller, each with its shipping fee. Reserves nothing."""
    return p.quote(ordering.quote(s, user, body.address_id))


@router.post(
    "/checkout",
    tags=["Checkout"],
    status_code=201,
    response_model=CheckoutResult,
    responses={**errors(400, 404, 409), 200: {"model": CheckoutResult, "description": "Replay of a key"}},
)
def checkout(body: CheckoutRequest, key: IdempotencyKey, user: CurrentUser, s: DB, response: Response):
    """Place an order from the ticked lines.

    Locks the variants in id order, re-prices everything, reserves stock and splits the order into one parcel per
    seller. **COD**: stock is committed and the order is placed. **Card/wallet**: stock is held for 15 minutes and the
    response carries the gateway redirect. A repeated `Idempotency-Key` returns the original order with 200.
    """
    result = ordering.checkout(
        s,
        user,
        address_id=body.address_id,
        payment_method=body.payment_method,
        expected_total=body.expected_total,
        key=key,
    )
    if not result.created:
        response.status_code = 200
    redirect = (
        PaymentRedirect(payment_id=result.payment.id, redirect_url=payment_gateway.hosted_page_url(result.payment.id))
        if result.payment and result.order.status == OrderStatus.pending_payment
        else None
    )
    return CheckoutResult(order=p.order(result.order), payment=redirect)


# ── Orders ─────────────────────────────────────────────────────────────


@router.get("/me/orders", tags=["Orders"], response_model=PageOf[OrderSummary])
def my_orders(
    user: CurrentUser,
    s: DB,
    status: OrderStatus | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
):
    page = ordering.my_orders(s, user, status=status, limit=limit, cursor=cursor)
    return PageOf[OrderSummary](items=[p.order_summary(o) for o in page.items], next_cursor=page.next_cursor)


@router.get("/me/orders/{order_id}", tags=["Orders"], response_model=OrderOut, responses=errors(404))
def my_order(order_id: Id, user: CurrentUser, s: DB):
    """One order with its parcels, items, charges and refunds."""
    o = ordering.my_order(s, user, order_id)
    return p.order(o, ordering.cancel_reason(s, o))


@router.post("/me/orders/{order_id}/cancel", tags=["Orders"], response_model=OrderOut, responses=errors(404, 409))
def cancel(order_id: Id, user: CurrentUser, s: DB, body: ReasonRequest | None = None):
    """Cancel the whole order while nothing has been picked up. Releases stock and refunds online payments."""
    o = ordering.cancel_by_customer(s, user, order_id, body.reason if body else None)
    return p.order(o, ordering.cancel_reason(s, o))
