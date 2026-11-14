from dataclasses import dataclass

from sqlalchemy import and_, exists, func, or_, select
from sqlalchemy.orm import Session, selectinload

from app.data.models import Category, Product, ProductStatus, ProductVariant, SellerStatus, User
from app.data.pagination import Page, decode, keyset_page, offset_page
from app.data.text import ESCAPE, contains

# ── Categories ─────────────────────────────────────────────────────────


def all_categories(s: Session) -> list[Category]:
    return list(s.scalars(select(Category).order_by(Category.name)))


def category_by_id(s: Session, category_id: int) -> Category | None:
    return s.get(Category, category_id)


def category_by_slug(s: Session, slug: str) -> Category | None:
    return s.scalar(select(Category).where(Category.slug == slug))


def slug_taken(s: Session, slug: str, *, except_id: int | None = None) -> bool:
    q = select(func.count()).select_from(Category).where(Category.slug == slug)
    if except_id:
        q = q.where(Category.id != except_id)
    return s.scalar(q) > 0


def category_in_use(s: Session, category_id: int) -> bool:
    has_products = s.scalar(select(exists().where(Product.category_id == category_id)))
    has_children = s.scalar(select(exists().where(Category.parent_id == category_id)))
    return bool(has_products or has_children)


def option_values_in_use(s: Session, category_id: int) -> dict[str, set[str]]:
    """Option values that existing variants in this category use, by option name."""
    rows = s.execute(select(ProductVariant.options).join(Product).where(Product.category_id == category_id)).scalars()
    used: dict[str, set[str]] = {}
    for options in rows:
        for name, value in options.items():
            used.setdefault(name, set()).add(value)
    return used


def add(s: Session, obj):
    s.add(obj)
    s.flush()
    return obj


def delete(s: Session, obj) -> None:
    s.delete(obj)
    s.flush()


# ── Public catalogue ───────────────────────────────────────────────────


def _sellable_variant():
    return and_(ProductVariant.product_id == Product.id, ProductVariant.is_active.is_(True))


def _visible():
    return and_(
        Product.status == ProductStatus.active,
        User.seller_status == SellerStatus.approved,
        exists().where(_sellable_variant()),
    )


@dataclass
class ProductRow:
    product: Product
    price_from: int
    price_to: int
    in_stock: bool


def search_products(
    s: Session,
    *,
    q: str | None,
    category_ids: list[int] | None,
    min_price: int | None,
    max_price: int | None,
    options: dict[str, str],
    in_stock: bool | None,
    sort: str,
    limit: int,
    cursor: str | None,
) -> Page[ProductRow]:
    v = ProductVariant
    stats = (
        select(
            v.product_id.label("pid"),
            func.min(v.price).label("price_from"),
            func.max(v.price).label("price_to"),
            func.bool_or(v.on_hand > v.reserved).label("in_stock"),
        )
        .where(v.is_active.is_(True))
        .group_by(v.product_id)
        .subquery()
    )
    stmt = (
        select(Product, stats.c.price_from, stats.c.price_to, stats.c.in_stock)
        .join(User, User.id == Product.seller_id)
        .join(stats, stats.c.pid == Product.id)
        .where(_visible())
        .options(selectinload(Product.seller))
    )
    if q:
        like = contains(q)
        stmt = stmt.where(
            or_(
                func.lower(Product.name).like(like, escape=ESCAPE),
                func.lower(Product.description).like(like, escape=ESCAPE),
            )
        )
    if category_ids:
        stmt = stmt.where(Product.category_id.in_(category_ids))
    if min_price is not None:
        stmt = stmt.where(stats.c.price_to >= min_price)
    if max_price is not None:
        stmt = stmt.where(stats.c.price_from <= max_price)
    for name, value in options.items():
        stmt = stmt.where(exists().where(_sellable_variant(), v.options.contains({name: value})))
    if in_stock:
        stmt = stmt.where(stats.c.in_stock.is_(True))

    order = {
        "newest": [Product.created_at.desc()],
        "price_asc": [stats.c.price_from.asc()],
        "price_desc": [stats.c.price_from.desc()],
    }.get(sort, [stats.c.in_stock.desc(), Product.created_at.desc()])
    offset = decode(cursor, "o") or 0
    rows = s.execute(stmt.order_by(*order, Product.id.desc()).offset(offset).limit(limit + 1)).all()
    return offset_page([ProductRow(p, lo, hi, bool(stock)) for p, lo, hi, stock in rows], limit, offset)


def visible_product(s: Session, product_id: int) -> Product | None:
    stmt = (
        select(Product)
        .join(User, User.id == Product.seller_id)
        .where(Product.id == product_id, _visible())
        .options(selectinload(Product.variants), selectinload(Product.seller), selectinload(Product.category))
    )
    return s.scalar(stmt)


def variant_for_sale(s: Session, variant_id: int) -> ProductVariant | None:
    """The variant if it can be bought right now (active, product active, seller approved)."""
    stmt = (
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .join(User, User.id == Product.seller_id)
        .where(
            ProductVariant.id == variant_id,
            ProductVariant.is_active.is_(True),
            Product.status == ProductStatus.active,
            User.seller_status == SellerStatus.approved,
        )
    )
    return s.scalar(stmt)


# ── Seller's own catalogue ─────────────────────────────────────────────


def seller_products(
    s: Session, seller_id: int, *, status: ProductStatus | None, q: str | None, limit: int, cursor: str | None
) -> Page[Product]:
    stmt = (
        select(Product)
        .where(Product.seller_id == seller_id)
        .options(selectinload(Product.variants))
        .order_by(Product.id.desc())
        .limit(limit + 1)
    )
    if status:
        stmt = stmt.where(Product.status == status)
    if q:
        stmt = stmt.where(func.lower(Product.name).like(contains(q), escape=ESCAPE))
    if (after := decode(cursor, "i")) is not None:
        stmt = stmt.where(Product.id < after)
    return keyset_page(list(s.scalars(stmt)), limit)


def own_product(s: Session, seller_id: int, product_id: int) -> Product | None:
    stmt = (
        select(Product)
        .where(Product.id == product_id, Product.seller_id == seller_id)
        .options(selectinload(Product.variants), selectinload(Product.category))
    )
    return s.scalar(stmt)


def own_variant(s: Session, seller_id: int, variant_id: int, *, lock: bool = False) -> ProductVariant | None:
    stmt = (
        select(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(ProductVariant.id == variant_id, Product.seller_id == seller_id)
    )
    return s.scalar(stmt.with_for_update(of=ProductVariant) if lock else stmt)


def sku_taken(s: Session, seller_id: int, sku: str, *, except_variant: int | None = None) -> bool:
    """SKUs are unique per seller (not platform-wide), so the check joins through products."""
    stmt = (
        select(func.count())
        .select_from(ProductVariant)
        .join(Product, Product.id == ProductVariant.product_id)
        .where(Product.seller_id == seller_id, func.lower(ProductVariant.sku) == sku.lower())
    )
    if except_variant:
        stmt = stmt.where(ProductVariant.id != except_variant)
    return s.scalar(stmt) > 0


def options_taken(s: Session, product_id: int, options: dict[str, str]) -> bool:
    stmt = select(exists().where(ProductVariant.product_id == product_id, ProductVariant.options == options))
    return bool(s.scalar(stmt))


def lock_variants(s: Session, variant_ids: list[int]) -> dict[int, ProductVariant]:
    """Row-lock variants in id order, so two overlapping checkouts can never deadlock."""
    stmt = (
        select(ProductVariant)
        .where(ProductVariant.id.in_(sorted(set(variant_ids))))
        .order_by(ProductVariant.id)
        .with_for_update()
        .options(selectinload(ProductVariant.product).selectinload(Product.seller))
        # Overwrite any copies already in the session with the locked rows' current values.
        .execution_options(populate_existing=True)
    )
    return {v.id: v for v in s.scalars(stmt)}
