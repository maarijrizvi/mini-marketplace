from sqlalchemy import delete, select, update
from sqlalchemy.orm import Session, selectinload

from app.data.models import CartItem, Product, ProductVariant


def lines(s: Session, user_id: int, *, selected_only: bool = False) -> list[CartItem]:
    stmt = (
        select(CartItem)
        .where(CartItem.user_id == user_id)
        .options(selectinload(CartItem.variant).selectinload(ProductVariant.product).selectinload(Product.seller))
        .order_by(CartItem.id)
    )
    if selected_only:
        stmt = stmt.where(CartItem.selected.is_(True))
    return list(s.scalars(stmt))


def line(s: Session, user_id: int, variant_id: int) -> CartItem | None:
    return s.scalar(select(CartItem).where(CartItem.user_id == user_id, CartItem.variant_id == variant_id))


def add(s: Session, item: CartItem) -> CartItem:
    s.add(item)
    s.flush()
    return item


def remove(s: Session, item: CartItem) -> None:
    s.delete(item)
    s.flush()


def set_selected(s: Session, user_id: int, selected: bool, variant_ids: list[int] | None) -> None:
    stmt = update(CartItem).where(CartItem.user_id == user_id).values(selected=selected)
    if variant_ids is not None:
        stmt = stmt.where(CartItem.variant_id.in_(variant_ids))
    s.execute(stmt)


def remove_variants(s: Session, user_id: int, variant_ids: list[int]) -> None:
    s.execute(delete(CartItem).where(CartItem.user_id == user_id, CartItem.variant_id.in_(variant_ids)))
