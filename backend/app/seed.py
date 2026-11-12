"""Seed the admin account and categories; with SEED_DEMO=true also demo shops, products and a customer.

Safe to run repeatedly: existing rows (matched by email or slug) are left alone.
    python -m app.seed
"""

import os

from sqlalchemy import select

from app.core.config import get_settings
from app.core.db import SessionLocal
from app.core.security import hash_password
from app.data.models import Admin, Category, Product, ProductStatus, ProductVariant, SellerStatus, User
from app.services.common import now

CATEGORIES = [
    (
        "Clothing",
        "clothing",
        None,
        {"size": ["XS", "S", "M", "L", "XL"], "colour": ["Black", "White", "Navy", "Olive", "Sand", "Red"]},
    ),
    ("Men", "men", "clothing", {"size": ["S", "M", "L", "XL"], "colour": ["Black", "White", "Navy", "Olive"]}),
    ("Women", "women", "clothing", {"size": ["XS", "S", "M", "L"], "colour": ["Black", "White", "Sand", "Red"]}),
    (
        "Home & Kitchen",
        "home-kitchen",
        None,
        {"colour": ["White", "Charcoal", "Terracotta", "Natural"], "set": ["Single", "Pair", "Set of 4"]},
    ),
    (
        "Electronics",
        "electronics",
        None,
        {"colour": ["Black", "White", "Blue"], "storage": ["64 GB", "128 GB", "256 GB"]},
    ),
    (
        "Phones",
        "phones",
        "electronics",
        {"colour": ["Black", "White", "Blue"], "storage": ["64 GB", "128 GB", "256 GB"]},
    ),
    ("Accessories", "accessories", "electronics", {"colour": ["Black", "White"]}),
    ("Beauty", "beauty", None, {"size": ["50 ml", "100 ml", "200 ml"]}),
]

DEMO_SHOPS = [
    (
        "kiln@example.com",
        "Hina",
        "Kiln & Co.",
        [
            (
                "Stoneware Mug",
                "home-kitchen",
                "Hand-glazed stoneware, dishwasher safe.",
                ["set"],
                [({"set": "Single"}, "KLN-MUG-1", 95000, 24), ({"set": "Set of 4"}, "KLN-MUG-4", 340000, 8)],
            ),
            (
                "Terracotta Planter",
                "home-kitchen",
                "Unglazed clay planter with drainage hole.",
                ["colour"],
                [({"colour": "Terracotta"}, "KLN-PLT-T", 180000, 12), ({"colour": "White"}, "KLN-PLT-W", 195000, 3)],
            ),
        ],
    ),
    (
        "northfield@example.com",
        "Bilal",
        "Northfield Textiles",
        [
            (
                "Linen Shirt",
                "men",
                "Breathable linen for Karachi summers.",
                ["size", "colour"],
                [
                    ({"size": "M", "colour": "White"}, "NFT-LS-M-W", 459900, 10),
                    ({"size": "L", "colour": "White"}, "NFT-LS-L-W", 459900, 6),
                    ({"size": "L", "colour": "Navy"}, "NFT-LS-L-N", 479900, 1),
                ],
            ),
            (
                "Lawn Kurta",
                "women",
                "Printed lawn, unstitched-quality fabric, ready to wear.",
                ["size", "colour"],
                [
                    ({"size": "S", "colour": "Sand"}, "NFT-LK-S", 389900, 9),
                    ({"size": "M", "colour": "Sand"}, "NFT-LK-M", 389900, 0),
                ],
            ),
        ],
    ),
    (
        "lumen@example.com",
        "Zara",
        "Lumen Supply",
        [
            (
                "Wireless Earbuds",
                "accessories",
                "Bluetooth 5.3, 24-hour case battery.",
                ["colour"],
                [({"colour": "Black"}, "LUM-EB-B", 649900, 15), ({"colour": "White"}, "LUM-EB-W", 649900, 4)],
            ),
            (
                "Power Bank 20,000 mAh",
                "accessories",
                "Fast charging, USB-C in and out.",
                ["colour"],
                [({"colour": "Black"}, "LUM-PB-B", 549900, 20)],
            ),
        ],
    ),
]


def run() -> None:
    settings = get_settings()
    demo = os.environ.get("SEED_DEMO", "").lower() in ("1", "true", "yes")
    with SessionLocal() as s:
        if not s.scalar(select(Admin).where(Admin.email == settings.seed_admin_email)):
            s.add(
                Admin(
                    email=settings.seed_admin_email,
                    password_hash=hash_password(settings.seed_admin_password),
                    full_name="Marketplace Admin",
                )
            )
            print(f"admin: {settings.seed_admin_email}")
        by_slug = {c.slug: c for c in s.scalars(select(Category))}
        for name, slug, parent, schema in CATEGORIES:
            if slug not in by_slug:
                cat = Category(
                    name=name, slug=slug, parent_id=by_slug[parent].id if parent else None, variant_schema=schema
                )
                s.add(cat)
                s.flush()
                by_slug[slug] = cat
        s.commit()
        if demo:
            _demo(s, by_slug)
            s.commit()


def _demo(s, by_slug) -> None:
    password = hash_password(os.environ.get("SEED_DEMO_PASSWORD", "Demo1234"))
    for email, first, shop, products in DEMO_SHOPS:
        if s.scalar(select(User).where(User.email == email)):
            continue
        seller = User(
            email=email,
            phone="+923001234567",
            password_hash=password,
            first_name=first,
            last_name="Demo",
            addresses=[],
            shop_name=shop,
            seller_status=SellerStatus.approved,
            email_verified_at=now(),
        )
        s.add(seller)
        s.flush()
        for name, slug, description, option_names, variants in products:
            product = Product(
                seller_id=seller.id,
                category_id=by_slug[slug].id,
                name=name,
                description=description,
                option_names=option_names,
                images=[],
                status=ProductStatus.active,
            )
            s.add(product)
            s.flush()
            for options, sku, price, on_hand in variants:
                s.add(ProductVariant(product_id=product.id, options=options, sku=sku, price=price, on_hand=on_hand))
        print(f"demo shop: {shop} ({email})")
    if not s.scalar(select(User).where(User.email == "alex@example.com")):
        s.add(
            User(
                email="alex@example.com",
                phone="+923011234567",
                password_hash=password,
                first_name="Alex",
                last_name="Customer",
                email_verified_at=now(),
                addresses=[
                    {
                        "id": "8f0c1b2a-0000-4000-8000-000000000001",
                        "label": "Home",
                        "recipient": "Alex",
                        "phone": "+923011234567",
                        "line1": "House 12, Street 4",
                        "area": "DHA Phase 6",
                        "city": "Karachi",
                        "province": "Sindh",
                    }
                ],
            )
        )
        print("demo customer: alex@example.com")


if __name__ == "__main__":
    run()
