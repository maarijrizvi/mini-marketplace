from sqlalchemy import func, or_, select
from sqlalchemy.orm import Session

from app.data.models import Admin, Order, SellerStatus, User
from app.data.pagination import Page, decode, keyset_page
from app.data.text import ESCAPE, contains


def user_by_id(s: Session, user_id: int, *, lock: bool = False) -> User | None:
    q = select(User).where(User.id == user_id)
    return s.scalar(q.with_for_update() if lock else q)


def user_by_email(s: Session, email: str) -> User | None:
    return s.scalar(select(User).where(User.email == email.lower()))


def email_taken(s: Session, email: str) -> bool:
    return s.scalar(select(func.count()).select_from(User).where(User.email == email.lower())) > 0


def shop_name_taken(s: Session, shop_name: str, *, except_user: int | None = None) -> bool:
    q = select(func.count()).select_from(User).where(func.lower(User.shop_name) == shop_name.lower())
    if except_user:
        q = q.where(User.id != except_user)
    return s.scalar(q) > 0


def add_user(s: Session, user: User) -> User:
    s.add(user)
    s.flush()
    return user


def search_users(
    s: Session, *, q: str | None, seller_status: SellerStatus | None, limit: int, cursor: str | None
) -> Page[User]:
    stmt = select(User).order_by(User.id.desc()).limit(limit + 1)
    if q:
        like = contains(q)
        stmt = stmt.where(
            or_(
                func.lower(User.email).like(like, escape=ESCAPE),
                func.lower(User.first_name + " " + User.last_name).like(like, escape=ESCAPE),
                User.phone.like(like, escape=ESCAPE),
                func.lower(User.shop_name).like(like, escape=ESCAPE),
            )
        )
    if seller_status:
        stmt = stmt.where(User.seller_status == seller_status)
    if (after := decode(cursor, "i")) is not None:
        stmt = stmt.where(User.id < after)
    return keyset_page(list(s.scalars(stmt)), limit)


def order_count(s: Session, user_id: int) -> int:
    return s.scalar(select(func.count()).select_from(Order).where(Order.user_id == user_id))


def admin_by_email(s: Session, email: str) -> Admin | None:
    return s.scalar(select(Admin).where(Admin.email == email.lower()))


def admin_by_id(s: Session, admin_id: int) -> Admin | None:
    return s.get(Admin, admin_id)


def add_admin(s: Session, admin: Admin) -> Admin:
    s.add(admin)
    s.flush()
    return admin
