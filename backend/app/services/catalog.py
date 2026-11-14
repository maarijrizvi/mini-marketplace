"""Catalogue: public browsing, sellers' own products and variants, admin categories."""

from typing import Any

from sqlalchemy.orm import Session

from app.core.errors import ApiError, conflict, field_error, invalid_transition, not_found
from app.data.models import Category, Product, ProductStatus, ProductVariant, User
from app.data.pagination import Page
from app.data.repositories import catalog as repo
from app.services.common import Actor, record

# ── Categories ─────────────────────────────────────────────────────────


def categories(s: Session) -> list[Category]:
    return repo.all_categories(s)


def product_counts(s: Session) -> dict[int, int]:
    """Products on sale per category, sub-categories included."""
    own = repo.visible_counts(s)
    cats = repo.all_categories(s)
    children: dict[int | None, list[int]] = {}
    for c in cats:
        children.setdefault(c.parent_id, []).append(c.id)

    def total(cid: int) -> int:
        return own.get(cid, 0) + sum(total(ch) for ch in children.get(cid, []))

    return {c.id: total(c.id) for c in cats}


def category_by_slug(s: Session, slug: str) -> Category:
    return repo.category_by_slug(s, slug) or _missing("category")


def descendant_ids(s: Session, category: Category) -> list[int]:
    children: dict[int | None, list[int]] = {}
    for c in repo.all_categories(s):
        children.setdefault(c.parent_id, []).append(c.id)
    out, stack = [], [category.id]
    while stack:
        cid = stack.pop()
        out.append(cid)
        stack.extend(children.get(cid, []))
    return out


def create_category(s: Session, admin: Actor, data: dict[str, Any]) -> Category:
    if repo.slug_taken(s, data["slug"]):
        raise ApiError(409, "slug_taken", "Another category uses this slug.", field_errors={"slug": ["Already used."]})
    parent_id = data.get("parent_id")
    if parent_id and not repo.category_by_id(s, parent_id):
        raise field_error("parentId", "That parent category doesn't exist.")
    category = repo.add(
        s,
        Category(
            name=data["name"].strip(),
            slug=data["slug"],
            parent_id=parent_id,
            variant_schema=_clean_schema(data.get("variant_schema") or {}),
        ),
    )
    record(s, admin, "category", category.id, "created", name=category.name)
    s.commit()
    return category


def update_category(s: Session, admin: Actor, category_id: int, changes: dict[str, Any]) -> Category:
    category = repo.category_by_id(s, category_id) or _missing("category")
    before = {
        "name": category.name,
        "slug": category.slug,
        "parentId": category.parent_id,
        "variantSchema": category.variant_schema,
    }
    if "slug" in changes and repo.slug_taken(s, changes["slug"], except_id=category.id):
        raise ApiError(409, "slug_taken", "Another category uses this slug.", field_errors={"slug": ["Already used."]})
    if "parent_id" in changes:
        _check_parent(s, category, changes["parent_id"])
        category.parent_id = changes["parent_id"]
    if "variant_schema" in changes:
        schema = _clean_schema(changes["variant_schema"] or {})
        for name, values in repo.option_values_in_use(s, category.id).items():
            missing = values - set(schema.get(name, []))
            if missing:
                raise conflict(
                    "option_value_in_use",
                    f"Products still use {name} = {', '.join(sorted(missing))}; those values can't be removed.",
                )
        category.variant_schema = schema
    if "name" in changes:
        category.name = changes["name"].strip()
    if "slug" in changes:
        category.slug = changes["slug"]
    record(s, admin, "category", category.id, "updated", before=before)
    s.commit()
    return category


def delete_category(s: Session, admin: Actor, category_id: int) -> None:
    category = repo.category_by_id(s, category_id) or _missing("category")
    if repo.category_in_use(s, category.id):
        raise conflict("category_in_use", "This category has products or sub-categories, so it can't be deleted.")
    record(s, admin, "category", category.id, "deleted", name=category.name, slug=category.slug)
    repo.delete(s, category)
    s.commit()


def _check_parent(s: Session, category: Category, parent_id: int | None) -> None:
    seen = category.id
    while parent_id is not None:
        if parent_id == seen:
            raise conflict("category_cycle", "A category can't sit inside itself.")
        parent = repo.category_by_id(s, parent_id)
        if not parent:
            raise field_error("parentId", "That parent category doesn't exist.")
        parent_id = parent.parent_id


def _clean_schema(schema: dict[str, list[str]]) -> dict[str, list[str]]:
    out = {}
    for name, values in schema.items():
        name = name.strip().lower()
        clean = []
        for v in values:
            v = v.strip()
            if v and v.lower() not in {c.lower() for c in clean}:
                clean.append(v)
        if name and clean:
            out[name] = clean
    return out


# ── Public catalogue ───────────────────────────────────────────────────


def search(s: Session, **filters) -> Page[repo.ProductRow]:
    slug = filters.pop("category", None)
    filters["category_ids"] = descendant_ids(s, category_by_slug(s, slug)) if slug else None
    return repo.search_products(s, **filters)


def product_detail(s: Session, product_id: int) -> Product:
    return repo.visible_product(s, product_id) or _missing("product")


# ── Seller's catalogue ─────────────────────────────────────────────────


def seller_products(s: Session, seller: User, **filters) -> Page[Product]:
    return repo.seller_products(s, seller.id, **filters)


def own_product(s: Session, seller: User, product_id: int) -> Product:
    return repo.own_product(s, seller.id, product_id) or _missing("product")


def create_product(s: Session, seller: User, data: dict[str, Any]) -> Product:
    category = _category_for(s, data["category_id"])
    option_names = _check_option_names(category, data["option_names"])
    product = repo.add(
        s,
        Product(
            seller_id=seller.id,
            category_id=category.id,
            name=data["name"].strip(),
            description=data.get("description", "").strip(),
            option_names=option_names,
            images=data.get("images") or [],
            status=ProductStatus.draft,
        ),
    )
    record(s, Actor.user(seller.id), "product", product.id, "created", name=product.name)
    s.commit()
    return own_product(s, seller, product.id)


def update_product(s: Session, seller: User, product_id: int, changes: dict[str, Any]) -> Product:
    product = own_product(s, seller, product_id)
    if product.status == ProductStatus.archived:
        raise invalid_transition("Archived products can't be edited.")
    category = _category_for(s, changes.get("category_id", product.category_id))
    if "option_names" in changes:
        if product.variants and set(changes["option_names"]) != set(product.option_names):
            raise conflict("options_locked", "Options can't change once the product has variants.")
        product.option_names = _check_option_names(category, changes["option_names"])
    elif "category_id" in changes:
        _check_option_names(category, product.option_names)
    for key in ("name", "description"):
        if key in changes:
            setattr(product, key, changes[key].strip())
    if "images" in changes:
        product.images = changes["images"]
    product.category_id = category.id
    record(s, Actor.user(seller.id), "product", product.id, "updated", fields=sorted(changes))
    s.commit()
    return own_product(s, seller, product.id)


def publish(s: Session, seller: User, product_id: int) -> Product:
    product = own_product(s, seller, product_id)
    if product.status != ProductStatus.draft:
        raise invalid_transition(f"Only draft products can be published; this one is {product.status}.")
    if not any(v.is_active for v in product.variants):
        raise conflict("no_active_variant", "Add at least one active variant before publishing.")
    product.status = ProductStatus.active
    record(s, Actor.user(seller.id), "product", product.id, "published")
    s.commit()
    return own_product(s, seller, product.id)


def archive(s: Session, seller: User, product_id: int) -> Product:
    product = own_product(s, seller, product_id)
    if product.status == ProductStatus.archived:
        raise invalid_transition("This product is already archived.")
    product.status = ProductStatus.archived
    record(s, Actor.user(seller.id), "product", product.id, "archived")
    s.commit()
    return own_product(s, seller, product.id)


def add_variant(s: Session, seller: User, product_id: int, data: dict[str, Any]) -> ProductVariant:
    product = own_product(s, seller, product_id)
    if product.status == ProductStatus.archived:
        raise invalid_transition("Archived products can't get new variants.")
    options = _check_options(product, data["options"])
    _lock_seller(s, seller)
    if repo.sku_taken(s, seller.id, data["sku"]):
        raise ApiError(409, "sku_taken", "You already use this SKU.", field_errors={"sku": ["Already used."]})
    if repo.options_taken(s, product.id, options):
        raise conflict("options_taken", "This product already has a variant with these options.")
    variant = repo.add(
        s,
        ProductVariant(
            product_id=product.id,
            options=options,
            sku=data["sku"],
            price=data["price"],
            on_hand=data["on_hand"],
            reserved=0,
            images=data.get("images") or [],
            is_active=True,
        ),
    )
    record(
        s,
        Actor.user(seller.id),
        "variant",
        variant.id,
        "created",
        sku=variant.sku,
        price=variant.price,
        onHand=variant.on_hand,
    )
    s.commit()
    return variant


def update_variant(s: Session, seller: User, variant_id: int, changes: dict[str, Any]) -> ProductVariant:
    variant = repo.own_variant(s, seller.id, variant_id, lock=True) or _missing("variant")
    before = {"sku": variant.sku, "price": variant.price, "isActive": variant.is_active}
    if "sku" in changes and changes["sku"] != variant.sku:
        _lock_seller(s, seller)
        if repo.sku_taken(s, seller.id, changes["sku"], except_variant=variant.id):
            raise ApiError(409, "sku_taken", "You already use this SKU.", field_errors={"sku": ["Already used."]})
        variant.sku = changes["sku"]
    if "price" in changes:
        variant.price = changes["price"]
    if "images" in changes:
        variant.images = changes["images"]
    if "is_active" in changes:
        variant.is_active = changes["is_active"]
    action = "price_changed" if before["price"] != variant.price else "updated"
    record(
        s,
        Actor.user(seller.id),
        "variant",
        variant.id,
        action,
        before=before,
        after={"sku": variant.sku, "price": variant.price, "isActive": variant.is_active},
    )
    s.commit()
    return variant


def adjust_stock(s: Session, seller: User, variant_id: int, delta: int, reason: str) -> ProductVariant:
    variant = repo.own_variant(s, seller.id, variant_id, lock=True) or _missing("variant")
    new_on_hand = variant.on_hand + delta
    if new_on_hand < variant.reserved:
        raise conflict(
            "below_reserved",
            f"{variant.reserved} units are held for orders, so stock can't go below that.",
            reserved=variant.reserved,
        )
    before = variant.on_hand
    variant.on_hand = new_on_hand
    record(
        s,
        Actor.user(seller.id),
        "variant",
        variant.id,
        "stock_adjusted",
        before=before,
        after=new_on_hand,
        delta=delta,
        reason=reason,
    )
    s.commit()
    return variant


def _lock_seller(s: Session, seller: User) -> None:
    """SKU uniqueness spans the seller's products, so SKU checks serialise on the seller's row."""
    from app.data.repositories import identity

    identity.user_by_id(s, seller.id, lock=True)


def _category_for(s: Session, category_id: int) -> Category:
    category = repo.category_by_id(s, category_id)
    if not category:
        raise field_error("categoryId", "Choose a category.")
    return category


def _check_option_names(category: Category, names: list[str]) -> list[str]:
    names = [n.strip().lower() for n in names]
    unknown = [n for n in names if n not in category.variant_schema]
    if unknown:
        allowed = ", ".join(category.variant_schema) or "none"
        raise field_error("optionNames", f"{category.name} doesn't allow {', '.join(unknown)}. Allowed: {allowed}.")
    return names


def _check_options(product: Product, options: dict[str, str]) -> dict[str, str]:
    options = {k.strip().lower(): v.strip() for k, v in options.items()}
    if set(options) != set(product.option_names):
        expected = ", ".join(product.option_names) or "no options"
        raise field_error("options", f"Set exactly: {expected}.")
    schema = product.category.variant_schema
    for name, value in options.items():
        allowed = schema.get(name, [])
        match = next((a for a in allowed if a.lower() == value.lower()), None)
        if match is None:
            raise field_error("options", f"{value} isn't an allowed {name}. Allowed: {', '.join(allowed)}.")
        options[name] = match
    return options


def _missing(what: str):
    raise not_found(f"That {what} doesn't exist.")
