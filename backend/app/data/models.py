"""ORM mapping of the_ERD.pdf (12 tables).

Rules from the ERD: money is integer paisa; anything an order depends on is copied onto it; fixed value sets are
Postgres enums. Two agreed additions: `users.email_verified_at` and `seller_orders.shipping_fee`.
"""

import enum
from datetime import datetime
from typing import Any

from sqlalchemy import (
    ARRAY,
    BigInteger,
    Boolean,
    CheckConstraint,
    DateTime,
    Enum,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def _enum(cls: type[enum.Enum], name: str) -> Enum:
    return Enum(cls, name=name, values_callable=lambda e: [m.value for m in e])


def _pk() -> Mapped[int]:
    return mapped_column(BigInteger, primary_key=True, autoincrement=True)


def _created() -> Mapped[datetime]:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


# ── Enums ──────────────────────────────────────────────────────────────


class SellerStatus(enum.StrEnum):
    pending = "pending"
    approved = "approved"
    rejected = "rejected"
    suspended = "suspended"


class ProductStatus(enum.StrEnum):
    draft = "draft"
    active = "active"
    archived = "archived"


class OrderPaymentMethod(enum.StrEnum):
    cod = "cod"
    online = "online"


class OrderStatus(enum.StrEnum):
    pending_payment = "pending_payment"
    placed = "placed"
    completed = "completed"
    cancelled = "cancelled"


class ParcelStatus(enum.StrEnum):
    pending = "pending"
    shipped = "shipped"
    delivered = "delivered"
    refused = "refused"
    delivery_failed = "delivery_failed"
    cancelled = "cancelled"


PARCEL_FINAL = {ParcelStatus.delivered, ParcelStatus.refused, ParcelStatus.delivery_failed, ParcelStatus.cancelled}


class ItemStatus(enum.StrEnum):
    active = "active"
    dropped = "dropped"


class Reservation(enum.StrEnum):
    held = "held"
    committed = "committed"
    released = "released"


class PaymentKind(enum.StrEnum):
    charge = "charge"
    refund = "refund"


class PaymentMethod(enum.StrEnum):
    cod = "cod"
    card = "card"
    wallet = "wallet"


class PaymentStatus(enum.StrEnum):
    pending = "pending"
    succeeded = "succeeded"
    failed = "failed"


class LedgerEntryType(enum.StrEnum):
    sale = "sale"
    commission = "commission"
    refund = "refund"
    payout = "payout"


class ActorType(enum.StrEnum):
    user = "user"
    admin = "admin"
    system = "system"


# ── Identity ───────────────────────────────────────────────────────────


class Admin(Base):
    __tablename__ = "admins"

    id: Mapped[int] = _pk()
    email: Mapped[str] = mapped_column(String(254), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    full_name: Mapped[str] = mapped_column(String(120))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    last_login_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )


class User(Base):
    """Customers and sellers share this table; seller fields stay null until the user applies to sell."""

    __tablename__ = "users"

    id: Mapped[int] = _pk()
    email: Mapped[str] = mapped_column(String(254), unique=True)
    phone: Mapped[str] = mapped_column(String(20))
    password_hash: Mapped[str] = mapped_column(String(255))
    first_name: Mapped[str] = mapped_column(String(60))
    last_name: Mapped[str] = mapped_column(String(60))
    addresses: Mapped[list[dict[str, Any]]] = mapped_column(JSONB, default=list, server_default=text("'[]'::jsonb"))
    shop_name: Mapped[str | None] = mapped_column(String(60), unique=True)
    seller_status: Mapped[SellerStatus | None] = mapped_column(_enum(SellerStatus, "seller_status"))
    seller_status_reason: Mapped[str | None] = mapped_column(Text)
    reviewed_by: Mapped[int | None] = mapped_column(ForeignKey("admins.id"))
    email_verified_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    reviewer: Mapped[Admin | None] = relationship()

    __table_args__ = (Index("users_seller_status_idx", "seller_status"),)


# ── Catalog ────────────────────────────────────────────────────────────


class Category(Base):
    __tablename__ = "categories"

    id: Mapped[int] = _pk()
    parent_id: Mapped[int | None] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(String(60))
    slug: Mapped[str] = mapped_column(String(60), unique=True)
    # Allowed option values, admin-only: {"size": ["S","M","L"], "colour": ["red","blue"]}
    variant_schema: Mapped[dict[str, list[str]]] = mapped_column(
        JSONB, default=dict, server_default=text("'{}'::jsonb")
    )


class Product(Base):
    __tablename__ = "products"

    id: Mapped[int] = _pk()
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    category_id: Mapped[int] = mapped_column(ForeignKey("categories.id"))
    name: Mapped[str] = mapped_column(String(120))
    description: Mapped[str] = mapped_column(Text, default="", server_default="")
    option_names: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    images: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    status: Mapped[ProductStatus] = mapped_column(
        _enum(ProductStatus, "product_status"), default=ProductStatus.draft, server_default="draft"
    )
    created_at: Mapped[datetime] = _created()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    seller: Mapped[User] = relationship()
    category: Mapped[Category] = relationship()
    variants: Mapped[list["ProductVariant"]] = relationship(back_populates="product", order_by="ProductVariant.id")

    __table_args__ = (
        Index("products_seller_idx", "seller_id"),
        Index("products_category_status_idx", "category_id", "status"),
    )


class ProductVariant(Base):
    """One size/colour of a product, with its own price, SKU and stock. available = on_hand − reserved."""

    __tablename__ = "product_variants"

    id: Mapped[int] = _pk()
    product_id: Mapped[int] = mapped_column(ForeignKey("products.id"))
    options: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    sku: Mapped[str] = mapped_column(String(40))
    price: Mapped[int] = mapped_column(Integer)
    on_hand: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    reserved: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    images: Mapped[list[str]] = mapped_column(ARRAY(Text), default=list, server_default="{}")
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))

    product: Mapped[Product] = relationship(back_populates="variants")

    __table_args__ = (
        UniqueConstraint("product_id", "options", name="product_variants_product_options_key"),
        CheckConstraint("price > 0", name="product_variants_price_positive"),
        CheckConstraint("reserved >= 0 AND reserved <= on_hand", name="product_variants_reserved_within_on_hand"),
        Index("product_variants_sku_idx", "sku"),
    )

    @property
    def available(self) -> int:
        return self.on_hand - self.reserved


# ── Cart ───────────────────────────────────────────────────────────────


class CartItem(Base):
    """A user's cart is just their rows here. No price is stored: the variant's price is read every time."""

    __tablename__ = "cart_items"

    id: Mapped[int] = _pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"))
    quantity: Mapped[int] = mapped_column(Integer)
    selected: Mapped[bool] = mapped_column(Boolean, default=True, server_default=text("true"))
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now(), nullable=False
    )

    variant: Mapped[ProductVariant] = relationship()

    __table_args__ = (
        UniqueConstraint("user_id", "variant_id", name="cart_items_user_variant_key"),
        CheckConstraint("quantity > 0", name="cart_items_quantity_positive"),
    )


# ── Orders ─────────────────────────────────────────────────────────────


class Order(Base):
    __tablename__ = "orders"

    id: Mapped[int] = _pk()
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    idempotency_key: Mapped[str] = mapped_column(String(100))
    payment_method: Mapped[OrderPaymentMethod] = mapped_column(_enum(OrderPaymentMethod, "order_payment_method"))
    status: Mapped[OrderStatus] = mapped_column(_enum(OrderStatus, "order_status"))
    total: Mapped[int] = mapped_column(Integer)  # never edited; refunds live in payments
    shipping_address: Mapped[dict[str, Any]] = mapped_column(JSONB)
    placed_at: Mapped[datetime] = _created()

    user: Mapped[User] = relationship()
    parcels: Mapped[list["SellerOrder"]] = relationship(back_populates="order", order_by="SellerOrder.id")
    payments: Mapped[list["Payment"]] = relationship(
        back_populates="order", order_by="Payment.id", foreign_keys="Payment.order_id"
    )

    __table_args__ = (
        UniqueConstraint("user_id", "idempotency_key", name="orders_user_idempotency_key"),
        Index("orders_user_placed_idx", "user_id", "placed_at"),
    )


class SellerOrder(Base):
    """One seller's parcel within an order, with its own status, tracking number and deadline."""

    __tablename__ = "seller_orders"

    id: Mapped[int] = _pk()
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    status: Mapped[ParcelStatus] = mapped_column(
        _enum(ParcelStatus, "seller_order_status"), default=ParcelStatus.pending, server_default="pending"
    )
    shipping_fee: Mapped[int] = mapped_column(Integer, default=0, server_default="0")
    cod_amount: Mapped[int | None] = mapped_column(Integer)
    tracking_no: Mapped[str | None] = mapped_column(String(40), unique=True)
    ship_deadline: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    picked_up_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    order: Mapped[Order] = relationship(back_populates="parcels")
    seller: Mapped[User] = relationship()
    items: Mapped[list["OrderItem"]] = relationship(back_populates="parcel", order_by="OrderItem.id")

    __table_args__ = (
        UniqueConstraint("order_id", "seller_id", name="seller_orders_order_seller_key"),
        Index("seller_orders_seller_status_idx", "seller_id", "status"),
    )


class OrderItem(Base):
    """One variant bought. Name, options, price and commission are snapshots; it also tracks the stock hold."""

    __tablename__ = "order_items"

    id: Mapped[int] = _pk()
    seller_order_id: Mapped[int] = mapped_column(ForeignKey("seller_orders.id"))
    variant_id: Mapped[int] = mapped_column(ForeignKey("product_variants.id"))
    product_name: Mapped[str] = mapped_column(String(120))
    options: Mapped[dict[str, str]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    unit_price: Mapped[int] = mapped_column(Integer)
    quantity: Mapped[int] = mapped_column(Integer)
    commission_bps: Mapped[int] = mapped_column(Integer)
    status: Mapped[ItemStatus] = mapped_column(
        _enum(ItemStatus, "order_item_status"), default=ItemStatus.active, server_default="active"
    )
    reservation: Mapped[Reservation] = mapped_column(_enum(Reservation, "reservation_state"))
    reserved_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))  # online orders only

    parcel: Mapped[SellerOrder] = relationship(back_populates="items")
    variant: Mapped[ProductVariant] = relationship()

    __table_args__ = (
        CheckConstraint("quantity > 0", name="order_items_quantity_positive"),
        Index("order_items_held_until_idx", "reserved_until", postgresql_where=text("reservation = 'held'")),
    )

    @property
    def line_total(self) -> int:
        return self.unit_price * self.quantity


# ── Payments and money ─────────────────────────────────────────────────


class Payment(Base):
    """Every money movement between a customer and the platform: charges and refunds, failed attempts too."""

    __tablename__ = "payments"

    id: Mapped[int] = _pk()
    order_id: Mapped[int] = mapped_column(ForeignKey("orders.id"))
    seller_order_id: Mapped[int | None] = mapped_column(ForeignKey("seller_orders.id"))  # COD collections
    order_item_id: Mapped[int | None] = mapped_column(ForeignKey("order_items.id"))  # item refunds
    refund_of: Mapped[int | None] = mapped_column(ForeignKey("payments.id"))
    kind: Mapped[PaymentKind] = mapped_column(_enum(PaymentKind, "payment_kind"))
    method: Mapped[PaymentMethod] = mapped_column(_enum(PaymentMethod, "payment_method"))
    status: Mapped[PaymentStatus] = mapped_column(_enum(PaymentStatus, "payment_status"))
    amount: Mapped[int] = mapped_column(Integer)
    provider_ref: Mapped[str | None] = mapped_column(String(80), unique=True)
    created_at: Mapped[datetime] = _created()

    order: Mapped[Order] = relationship(back_populates="payments", foreign_keys=[order_id])

    __table_args__ = (
        CheckConstraint("amount >= 0", name="payments_amount_non_negative"),
        Index("payments_order_idx", "order_id"),
        Index("payments_status_idx", "status"),
    )


class SellerLedgerEntry(Base):
    """Money between the platform and a seller. Signed, append-only; a balance is the sum of entries."""

    __tablename__ = "seller_ledger"

    id: Mapped[int] = _pk()
    seller_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    seller_order_id: Mapped[int | None] = mapped_column(ForeignKey("seller_orders.id"))
    entry_type: Mapped[LedgerEntryType] = mapped_column(_enum(LedgerEntryType, "ledger_entry_type"))
    amount: Mapped[int] = mapped_column(Integer)
    created_at: Mapped[datetime] = _created()

    __table_args__ = (
        Index("seller_ledger_seller_idx", "seller_id", "created_at"),
        # One sale and one commission per parcel, so a repeated job can't post twice.
        Index(
            "seller_ledger_parcel_entry_key",
            "seller_order_id",
            "entry_type",
            unique=True,
            postgresql_where=text("entry_type IN ('sale', 'commission')"),
        ),
    )


# ── Infra ──────────────────────────────────────────────────────────────


class AuditLog(Base):
    __tablename__ = "audit_log"

    id: Mapped[int] = _pk()
    actor_type: Mapped[ActorType] = mapped_column(_enum(ActorType, "actor_type"))
    actor_id: Mapped[int | None] = mapped_column(BigInteger)  # users.id or admins.id; not a real FK
    entity_type: Mapped[str] = mapped_column(String(40))
    entity_id: Mapped[int] = mapped_column(BigInteger)
    action: Mapped[str] = mapped_column(String(60))
    data: Mapped[dict[str, Any]] = mapped_column(JSONB, default=dict, server_default=text("'{}'::jsonb"))
    created_at: Mapped[datetime] = _created()

    __table_args__ = (
        Index("audit_log_entity_idx", "entity_type", "entity_id"),
        Index("audit_log_created_idx", "created_at"),
    )
