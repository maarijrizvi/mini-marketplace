"""Customer and seller emails. Each one is queued as a `send_email` job in the caller's transaction."""

from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.data.models import Order, OrderItem, SellerOrder, User
from app.data.repositories import jobs
from app.services.common import rupees


def _queue(s: Session, to: str, subject: str, body: str) -> None:
    jobs.defer(s, "send_email", {"to": to, "subject": subject, "body": body})


def _url(path: str) -> str:
    return f"{get_settings().public_url}{path}"


def verify_email(s: Session, user: User, token: str) -> None:
    _queue(
        s,
        user.email,
        "Confirm your email",
        f"Hi {user.first_name},\n\nConfirm your email to start shopping:\n{_url(f'/verify-email?token={token}')}\n\n"
        "The link works for 24 hours. If you didn't sign up, ignore this email.",
    )


def reset_password(s: Session, user: User, token: str) -> None:
    _queue(
        s,
        user.email,
        "Reset your password",
        f"Hi {user.first_name},\n\nSet a new password here:\n{_url(f'/reset-password?token={token}')}\n\n"
        "The link works once, for 30 minutes. If you didn't ask for this, ignore this email.",
    )


def order_placed(s: Session, user: User, order: Order) -> None:
    lines = []
    for parcel in order.parcels:
        lines.append(f"\n{parcel.seller.shop_name}")
        for item in parcel.items:
            lines.append(f"  {item.quantity} × {item.product_name} — {rupees(item.line_total)}")
        lines.append(f"  Shipping {rupees(parcel.shipping_fee)}")
    pay = "Pay the courier in cash on delivery." if order.payment_method == "cod" else "Paid online."
    _queue(
        s,
        user.email,
        f"Order #{order.id} confirmed",
        f"Hi {user.first_name},\n\nThanks for your order #{order.id}.\n{chr(10).join(lines)}\n\n"
        f"Total {rupees(order.total)}. {pay}\n\nEach seller ships their own parcel; track them at "
        f"{_url(f'/orders/{order.id}')}",
    )


def order_cancelled(s: Session, user: User, order: Order, refund: int) -> None:
    refund_line = f" {rupees(refund)} is being refunded to your original payment method." if refund else ""
    _queue(
        s,
        user.email,
        f"Order #{order.id} cancelled",
        f"Hi {user.first_name},\n\nOrder #{order.id} has been cancelled.{refund_line}\n\n{_url(f'/orders/{order.id}')}",
    )


def item_dropped(s: Session, user: User, parcel: SellerOrder, item: OrderItem, refund: int) -> None:
    money = f"{rupees(refund)} is being refunded." if refund else "You won't be charged for it on delivery."
    _queue(
        s,
        user.email,
        f"An item in order #{parcel.order_id} can't be sent",
        f"Hi {user.first_name},\n\n{parcel.seller.shop_name} can't send {item.quantity} × {item.product_name}. "
        f"{money} The rest of your order goes ahead.\n\n{_url(f'/orders/{parcel.order_id}')}",
    )


def parcel_update(s: Session, user: User, parcel: SellerOrder, what: str) -> None:
    messages = {
        "shipped": f"is on its way with Leopards Courier (tracking {parcel.tracking_no}).",
        "delivered": "has been delivered.",
        "refused": "was returned to the seller because it was refused at the door.",
        "delivery_failed": "couldn't be delivered and is going back to the seller.",
    }
    _queue(
        s,
        user.email,
        f"Order #{parcel.order_id}: parcel from {parcel.seller.shop_name} {what.replace('_', ' ')}",
        f"Hi {user.first_name},\n\nYour parcel from {parcel.seller.shop_name} {messages[what]}\n\n"
        f"{_url(f'/orders/{parcel.order_id}')}",
    )


def seller_reviewed(s: Session, user: User) -> None:
    status = user.seller_status
    text = {
        "approved": "is approved. You can now list products and they'll appear in the shop.",
        "rejected": f"wasn't approved. Reason: {user.seller_status_reason}",
        "suspended": f"has been suspended. Reason: {user.seller_status_reason}",
    }.get(status, f"is now {status}.")
    _queue(
        s,
        user.email,
        f"Your shop {user.shop_name}: {status}",
        f"Hi {user.first_name},\n\nYour shop {user.shop_name} {text}\n\n{_url('/seller')}",
    )
