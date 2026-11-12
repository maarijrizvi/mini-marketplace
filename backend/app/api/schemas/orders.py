from datetime import datetime
from typing import Literal

from pydantic import Field

from app.api.schemas.base import Camel, Id, Input, Money, SignedMoney
from app.api.schemas.catalog import SellerRef
from app.data.models import (
    ItemStatus,
    LedgerEntryType,
    OrderPaymentMethod,
    OrderStatus,
    ParcelStatus,
    PaymentKind,
    PaymentMethod,
    PaymentStatus,
    Reservation,
)

# ── Cart ───────────────────────────────────────────────────────────────


class AddToCartRequest(Input):
    variant_id: Id
    quantity: int = Field(ge=1, le=99)


class CartItemUpdate(Input):
    quantity: int | None = Field(default=None, ge=1, le=99)
    selected: bool | None = None


class CartSelectionRequest(Input):
    selected: bool
    variant_ids: list[Id] | None = Field(default=None, description="Omit to apply to every line.")


class CartLine(Camel):
    variant_id: Id
    product_id: Id
    name: str
    options: dict[str, str]
    image: str | None
    unit_price: Money
    quantity: int
    line_total: Money
    available: int
    purchasable: bool
    selected: bool


class CartSellerGroup(Camel):
    seller: SellerRef
    lines: list[CartLine]


class Cart(Camel):
    groups: list[CartSellerGroup]
    selected_count: int
    selected_subtotal: Money


# ── Checkout ───────────────────────────────────────────────────────────


class QuoteRequest(Input):
    address_id: str = Field(max_length=40)


class QuoteParcel(Camel):
    seller: SellerRef
    lines: list[CartLine]
    items_total: Money
    shipping_fee: Money
    total: Money


class Quote(Camel):
    parcels: list[QuoteParcel]
    items_total: Money
    shipping_total: Money
    total: Money


class CheckoutRequest(Input):
    address_id: str = Field(max_length=40)
    payment_method: PaymentMethod = Field(description="`cod`, or `card`/`wallet` for an online order.")
    expected_total: Money = Field(description="The total the customer saw; a mismatch returns 409 prices_changed.")


class PaymentRedirect(Camel):
    payment_id: Id
    redirect_url: str


# ── Orders ─────────────────────────────────────────────────────────────


class OrderItemOut(Camel):
    id: Id
    variant_id: Id
    product_name: str
    options: dict[str, str]
    unit_price: Money
    quantity: int
    line_total: Money
    status: ItemStatus
    reservation: Reservation


class ParcelOut(Camel):
    id: Id
    seller: SellerRef
    status: ParcelStatus
    items_total: Money
    shipping_fee: Money
    cod_amount: Money | None
    tracking_no: str | None
    ship_deadline: datetime
    picked_up_at: datetime | None
    items: list[OrderItemOut]


class PaymentOut(Camel):
    id: Id
    order_id: Id
    seller_order_id: Id | None
    order_item_id: Id | None
    refund_of: Id | None
    kind: PaymentKind
    method: PaymentMethod
    status: PaymentStatus
    amount: Money
    provider_ref: str | None
    created_at: datetime


class ShippingAddress(Camel):
    id: str | None = None
    label: str
    recipient: str
    phone: str
    line1: str
    line2: str | None = None
    area: str | None = None
    city: str
    province: str | None = None
    postal_code: str | None = None


class OrderSummary(Camel):
    id: Id
    status: OrderStatus
    payment_method: OrderPaymentMethod
    total: Money
    parcel_count: int
    placed_at: datetime


class OrderOut(Camel):
    id: Id
    status: OrderStatus
    payment_method: OrderPaymentMethod
    total: Money
    refunded: Money
    shipping_address: ShippingAddress
    reserved_until: datetime | None
    placed_at: datetime
    parcels: list[ParcelOut]
    payments: list[PaymentOut]


class CheckoutResult(Camel):
    order: OrderOut
    payment: PaymentRedirect | None


class ReasonRequest(Input):
    reason: str | None = Field(default=None, max_length=500)


class RequiredReasonRequest(Input):
    reason: str = Field(min_length=1, max_length=500)


class SellerOrderItem(OrderItemOut):
    sku: str
    commission_bps: int


class SellerParcel(Camel):
    id: Id
    order_id: Id
    status: ParcelStatus
    items_total: Money
    shipping_fee: Money
    cod_amount: Money | None
    tracking_no: str | None
    ship_deadline: datetime
    picked_up_at: datetime | None
    late: bool
    shipping_address: ShippingAddress
    items: list[SellerOrderItem]
    placed_at: datetime


class DropItemRequest(Input):
    reason: Literal["out_of_stock", "damaged", "cannot_ship_to_address", "other"]
    note: str | None = Field(default=None, max_length=500)


# ── Money ──────────────────────────────────────────────────────────────


class LedgerEntryOut(Camel):
    id: Id
    seller_id: Id
    seller_order_id: Id | None
    entry_type: LedgerEntryType
    amount: SignedMoney
    created_at: datetime


class Balance(Camel):
    balance: SignedMoney


class PayoutRequest(Input):
    amount: Money = Field(gt=0)
    note: str | None = Field(default=None, max_length=200)
