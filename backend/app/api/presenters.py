"""Turn business-layer objects into API response models. No business decisions are made here."""

from typing import Any

from app.api.schemas import catalog as c
from app.api.schemas import identity as i
from app.api.schemas import ops as o
from app.api.schemas import orders as od
from app.data.models import (
    Admin,
    AuditLog,
    Category,
    ItemStatus,
    Order,
    OrderItem,
    PaymentKind,
    PaymentStatus,
    Product,
    ProductVariant,
    Reservation,
    SellerOrder,
    User,
)
from app.data.repositories.catalog import ProductRow
from app.data.repositories.jobs import JobRow
from app.services.cart import CartView, Line
from app.services.fulfilment import is_late
from app.services.ordering import Quote

# ── Identity ───────────────────────────────────────────────────────────


def user(u: User) -> i.UserOut:
    seller = (
        i.SellerProfile(shop_name=u.shop_name, status=u.seller_status, status_reason=u.seller_status_reason)
        if u.seller_status
        else None
    )
    return i.UserOut(
        id=u.id,
        email=u.email,
        first_name=u.first_name,
        last_name=u.last_name,
        phone=u.phone,
        email_verified=u.email_verified_at is not None,
        seller=seller,
        created_at=u.created_at,
    )


def admin_user(u: User, order_count: int) -> i.AdminUserView:
    reviewer = i.AdminRef(id=u.reviewer.id, full_name=u.reviewer.full_name) if u.reviewer else None
    return i.AdminUserView(**user(u).model_dump(), reviewed_by=reviewer, order_count=order_count)


def admin(a: Admin) -> i.AdminOut:
    return i.AdminOut(id=a.id, email=a.email, full_name=a.full_name, last_login_at=a.last_login_at)


def addresses(items: list[dict[str, Any]]) -> i.AddressList:
    return i.AddressList(items=[i.AddressOut(**a, is_default=(n == 0)) for n, a in enumerate(items)])


# ── Catalog ────────────────────────────────────────────────────────────


def category(cat: Category, product_count: int | None = None) -> c.CategoryOut:
    out = c.CategoryOut.model_validate(cat)
    out.product_count = product_count
    return out


def _seller_ref(u: User) -> c.SellerRef:
    return c.SellerRef(id=u.id, shop_name=u.shop_name or "")


def _image(p: Product, v: ProductVariant | None = None) -> str | None:
    if v and v.images:
        return v.images[0]
    if p.images:
        return p.images[0]
    return next((x.images[0] for x in p.variants if x.images), None) if "variants" in p.__dict__ else None


def product_summary(row: ProductRow) -> c.ProductSummary:
    p = row.product
    return c.ProductSummary(
        id=p.id,
        name=p.name,
        seller=_seller_ref(p.seller),
        category_id=p.category_id,
        image=_image(p),
        price_from=row.price_from,
        price_to=row.price_to,
        in_stock=row.in_stock,
    )


def product_detail(p: Product) -> c.ProductDetail:
    variants = [
        c.VariantOut(
            id=v.id, options=v.options, price=v.price, available=max(v.available, 0), images=v.images or p.images
        )
        for v in p.variants
        if v.is_active
    ]
    return c.ProductDetail(
        id=p.id,
        name=p.name,
        description=p.description,
        seller=_seller_ref(p.seller),
        category=category(p.category),
        option_names=p.option_names,
        images=p.images,
        variants=variants,
    )


def seller_variant(v: ProductVariant) -> c.SellerVariant:
    return c.SellerVariant(
        id=v.id,
        sku=v.sku,
        options=v.options,
        price=v.price,
        on_hand=v.on_hand,
        reserved=v.reserved,
        available=max(v.available, 0),
        images=v.images,
        is_active=v.is_active,
    )


def seller_product(p: Product) -> c.SellerProduct:
    return c.SellerProduct(
        id=p.id,
        category_id=p.category_id,
        name=p.name,
        description=p.description,
        option_names=p.option_names,
        images=p.images,
        status=p.status,
        variants=[seller_variant(v) for v in p.variants],
        created_at=p.created_at,
        updated_at=p.updated_at,
    )


# ── Cart and checkout ──────────────────────────────────────────────────


def _cart_line(line: Line) -> od.CartLine:
    v, p = line.variant, line.variant.product
    return od.CartLine(
        variant_id=v.id,
        product_id=p.id,
        name=p.name,
        options=v.options,
        image=_image(p, v),
        unit_price=line.unit_price,
        quantity=line.item.quantity,
        line_total=line.line_total,
        available=line.available,
        purchasable=line.purchasable,
        selected=line.item.selected,
    )


def cart(view: CartView) -> od.Cart:
    return od.Cart(
        groups=[
            od.CartSellerGroup(seller=_seller_ref(g.seller), lines=[_cart_line(x) for x in g.lines])
            for g in view.groups
        ],
        selected_count=sum(1 for _ in view.selected_lines),
        selected_subtotal=view.selected_subtotal,
    )


def quote(q: Quote) -> od.Quote:
    return od.Quote(
        parcels=[
            od.QuoteParcel(
                seller=_seller_ref(p.seller),
                lines=[_cart_line(x) for x in p.lines],
                items_total=p.items_total,
                shipping_fee=p.shipping_fee,
                total=p.total,
            )
            for p in q.parcels
        ],
        items_total=q.items_total,
        shipping_total=q.shipping_total,
        total=q.total,
    )


# ── Orders ─────────────────────────────────────────────────────────────


def _item(it: OrderItem) -> od.OrderItemOut:
    return od.OrderItemOut(
        id=it.id,
        variant_id=it.variant_id,
        product_name=it.product_name,
        options=it.options,
        unit_price=it.unit_price,
        quantity=it.quantity,
        line_total=it.line_total,
        status=it.status,
        reservation=it.reservation,
    )


def _items_total(p: SellerOrder) -> int:
    return sum(it.line_total for it in p.items if it.status == ItemStatus.active)


def parcel(p: SellerOrder) -> od.ParcelOut:
    return od.ParcelOut(
        id=p.id,
        seller=_seller_ref(p.seller),
        status=p.status,
        items_total=_items_total(p),
        shipping_fee=p.shipping_fee,
        cod_amount=p.cod_amount,
        tracking_no=p.tracking_no,
        ship_deadline=p.ship_deadline,
        picked_up_at=p.picked_up_at,
        items=[_item(it) for it in p.items],
    )


def payment(pay) -> od.PaymentOut:
    return od.PaymentOut.model_validate(pay)


def order(o_: Order, cancel_reason: str | None = None) -> od.OrderOut:
    refunded = sum(
        pay.amount for pay in o_.payments if pay.kind == PaymentKind.refund and pay.status == PaymentStatus.succeeded
    )
    holds = [
        it.reserved_until
        for p in o_.parcels
        for it in p.items
        if it.reservation == Reservation.held and it.reserved_until
    ]
    return od.OrderOut(
        id=o_.id,
        status=o_.status,
        payment_method=o_.payment_method,
        total=o_.total,
        refunded=refunded,
        shipping_address=od.ShippingAddress(**o_.shipping_address),
        reserved_until=min(holds) if holds else None,
        placed_at=o_.placed_at,
        cancel_reason=cancel_reason,
        parcels=[parcel(p) for p in o_.parcels],
        payments=[payment(x) for x in o_.payments],
    )


def order_summary(o_: Order) -> od.OrderSummary:
    return od.OrderSummary(
        id=o_.id,
        status=o_.status,
        payment_method=o_.payment_method,
        total=o_.total,
        parcel_count=len(o_.parcels),
        placed_at=o_.placed_at,
    )


def seller_parcel(p: SellerOrder) -> od.SellerParcel:
    return od.SellerParcel(
        id=p.id,
        order_id=p.order_id,
        status=p.status,
        items_total=_items_total(p),
        shipping_fee=p.shipping_fee,
        cod_amount=p.cod_amount,
        tracking_no=p.tracking_no,
        ship_deadline=p.ship_deadline,
        picked_up_at=p.picked_up_at,
        late=is_late(p),
        shipping_address=od.ShippingAddress(**p.order.shipping_address),
        items=[
            od.SellerOrderItem(**_item(it).model_dump(), sku=it.variant.sku, commission_bps=it.commission_bps)
            for it in p.items
        ],
        placed_at=p.order.placed_at,
    )


def ledger_entry(e) -> od.LedgerEntryOut:
    return od.LedgerEntryOut.model_validate(e)


# ── Operations ─────────────────────────────────────────────────────────


def audit_entry(a: AuditLog) -> o.AuditEntry:
    return o.AuditEntry.model_validate(a)


_JOB_STATUS = {"todo": "queued", "doing": "running"}


def job(j: JobRow) -> o.JobOut:
    return o.JobOut(
        id=j.id,
        task=j.task,
        args=j.args,
        status=_JOB_STATUS.get(j.status, j.status),
        attempts=j.attempts,
        scheduled_at=j.scheduled_at,
        created_at=j.created_at,
        started_at=j.started_at,
    )
