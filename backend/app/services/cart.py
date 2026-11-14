"""The cart: the user's `cart_items` rows, priced live from the variants (no prices are stored)."""

from dataclasses import dataclass, field

from sqlalchemy.orm import Session

from app.core.errors import ApiError, not_found
from app.data.models import CartItem, ProductStatus, ProductVariant, SellerStatus, User
from app.data.repositories import cart as repo
from app.data.repositories import catalog

MAX_QUANTITY = 99


@dataclass
class Line:
    item: CartItem
    variant: ProductVariant
    unit_price: int
    sellable: bool

    @property
    def available(self) -> int:
        return max(self.variant.available, 0)

    @property
    def purchasable(self) -> bool:
        return self.sellable and self.available >= self.item.quantity

    @property
    def line_total(self) -> int:
        return self.unit_price * self.item.quantity


@dataclass
class SellerGroup:
    seller: User
    lines: list[Line] = field(default_factory=list)


@dataclass
class CartView:
    groups: list[SellerGroup]

    @property
    def selected_lines(self) -> list[Line]:
        return [line for g in self.groups for line in g.lines if line.item.selected]

    @property
    def selected_subtotal(self) -> int:
        return sum(line.line_total for line in self.selected_lines if line.purchasable)


def _is_sellable(variant: ProductVariant) -> bool:
    product = variant.product
    return (
        variant.is_active
        and product.status == ProductStatus.active
        and product.seller.seller_status == SellerStatus.approved
    )


def view(s: Session, user: User, *, selected_only: bool = False) -> CartView:
    groups: dict[int, SellerGroup] = {}
    for item in repo.lines(s, user.id, selected_only=selected_only):
        v = item.variant
        group = groups.setdefault(v.product.seller_id, SellerGroup(v.product.seller))
        group.lines.append(Line(item, v, v.price, _is_sellable(v)))
    return CartView(list(groups.values()))


def add(s: Session, user: User, variant_id: int, quantity: int) -> CartView:
    variant = catalog.variant_for_sale(s, variant_id)
    if not variant:
        raise ApiError(409, "variant_unavailable", "This item isn't for sale right now.")
    item = repo.line(s, user.id, variant_id)
    in_cart = item.quantity if item else 0
    new_quantity = min(in_cart + quantity, MAX_QUANTITY)
    available = max(variant.available, 0)
    if new_quantity > available:
        more = max(available - in_cart, 0)
        if in_cart:
            message = f"You already have {in_cart} in your cart. " + (
                f"Only {more} more available." if more else "That's all the stock there is."
            )
        else:
            message = f"Only {available} left in stock." if available else "This item is sold out."
        raise ApiError(409, "insufficient_stock", message, details={"available": available, "inCart": in_cart})
    if item:
        item.quantity = new_quantity
        item.selected = True
    else:
        repo.add(s, CartItem(user_id=user.id, variant_id=variant_id, quantity=new_quantity, selected=True))
    s.commit()
    return view(s, user)


def update(s: Session, user: User, variant_id: int, quantity: int | None, selected: bool | None) -> CartView:
    item = repo.line(s, user.id, variant_id) or _missing()
    if quantity is not None and quantity != item.quantity:
        variant = item.variant
        if quantity > item.quantity and quantity > variant.available:
            raise ApiError(
                409,
                "insufficient_stock",
                f"Only {max(variant.available, 0)} left in stock.",
                details={"available": max(variant.available, 0)},
            )
        item.quantity = quantity
    if selected is not None:
        item.selected = selected
    s.commit()
    return view(s, user)


def remove(s: Session, user: User, variant_id: int) -> CartView:
    item = repo.line(s, user.id, variant_id) or _missing()
    repo.remove(s, item)
    s.commit()
    return view(s, user)


def select(s: Session, user: User, selected: bool, variant_ids: list[int] | None) -> CartView:
    repo.set_selected(s, user.id, selected, variant_ids)
    s.commit()
    return view(s, user)


def _missing():
    raise not_found("That item isn't in your cart.")
