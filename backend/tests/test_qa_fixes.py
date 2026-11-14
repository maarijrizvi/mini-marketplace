"""Regression tests for the QA report's High and Medium findings."""

from conftest import as_user, listed_product, with_address

from app.core.config import get_settings

API = "/api/v1"


def test_qa07_search_wildcards_are_literal(client, make):
    seller, cat = make.seller(), make.category()
    listed_product(
        client, seller, cat, [{"sku": "A", "options": {"size": "M"}, "price": 1000, "onHand": 3}], name="Plain Mug"
    )
    for term in ("%", "_", "\\"):
        assert client.get(f"{API}/products", params={"q": term}).json()["items"] == [], term
    assert len(client.get(f"{API}/products", params={"q": "mug"}).json()["items"]) == 1


def test_qa06_add_to_cart_counts_what_is_already_in_the_cart(client, make):
    seller, cat = make.seller(), make.category()
    _, (v,) = listed_product(client, seller, cat, [{"sku": "M4", "options": {"size": "M"}, "price": 1000, "onHand": 8}])
    as_user(client, make.user())
    assert client.post(f"{API}/me/cart/items", json={"variantId": v["id"], "quantity": 6}).status_code == 200
    r = client.post(f"{API}/me/cart/items", json={"variantId": v["id"], "quantity": 4})
    assert r.status_code == 409
    assert r.json()["message"] == "You already have 6 in your cart. Only 2 more available."
    assert r.json()["details"] == {"available": 8, "inCart": 6}


def test_qa09_validation_messages_are_plain_language(client, make):
    user = make.user()
    with_address(client, user)
    bad = {"label": "Home", "recipient": "Ali", "phone": "12345", "line1": "Street 1", "city": "Lahore"}
    r = client.post(f"{API}/me/addresses", json=bad)
    assert r.status_code == 400 and r.json()["fieldErrors"]["phone"][0].startswith("Enter a valid Pakistani phone")
    r = client.post(f"{API}/me/seller-application", json={"shopName": "   "})
    assert r.json()["fieldErrors"]["shopName"] == ["Enter at least 2 characters."]
    r = client.patch(f"{API}/me", json={"firstName": ""})
    assert r.json()["fieldErrors"]["firstName"] == ["This can't be empty."]


def test_qa10_bad_ids_are_not_found_and_query_errors_say_why(client, make):
    assert client.get(f"{API}/products/abc").status_code == 404
    as_user(client, make.user())
    r = client.get(f"{API}/me/orders/abc")
    assert r.status_code == 404 and r.json()["code"] == "not_found"
    r = client.get(f"{API}/products", params={"q": "x" * 101})
    assert r.status_code == 400 and r.json()["message"] == "Use at most 100 characters."


def test_qa02_docs_can_require_a_login(client, monkeypatch):
    assert client.get("/api/docs").status_code == 200  # open when DOCS_AUTH is unset (development)
    monkeypatch.setattr(get_settings(), "docs_auth", "docs:s3cret")
    for path in ("/api/docs", "/api/redoc", "/api/v1/openapi.json"):
        r = client.get(path)
        assert r.status_code == 401 and r.headers["www-authenticate"].startswith("Basic"), path
        assert client.get(path, auth=("docs", "wrong")).status_code == 401
        assert client.get(path, auth=("docs", "s3cret")).status_code == 200


def test_qa24_search_matches_plurals_and_shop_names(client, make):
    seller, cat = make.seller("Kiln & Co."), make.category()
    listed_product(
        client, seller, cat, [{"sku": "A", "options": {"size": "M"}, "price": 1000, "onHand": 3}], name="Stoneware Mug"
    )
    for term in ("mugs", "kiln", "stoneware mug", "MUG"):
        assert len(client.get(f"{API}/products", params={"q": term}).json()["items"]) == 1, term
    assert client.get(f"{API}/products", params={"q": "mug teapot"}).json()["items"] == []


def test_qa16_cancelled_order_carries_its_reason(client, make):
    seller, cat = make.seller(), make.category()
    _, (v,) = listed_product(client, seller, cat, [{"sku": "A", "options": {"size": "M"}, "price": 1000, "onHand": 3}])
    buyer = make.user()
    addr = with_address(client, buyer)
    client.post(f"{API}/me/cart/items", json={"variantId": v["id"], "quantity": 1})
    total = client.post(f"{API}/checkout/quote", json={"addressId": addr}).json()["total"]
    order = client.post(
        f"{API}/checkout",
        json={"addressId": addr, "paymentMethod": "cod", "expectedTotal": total},
        headers={"Idempotency-Key": "qa16-key-1"},
    ).json()["order"]
    assert order["cancelReason"] is None
    r = client.post(f"{API}/me/orders/{order['id']}/cancel", json={"reason": "Ordered twice"})
    assert r.json()["cancelReason"] == "Ordered twice"
    assert client.get(f"{API}/me/orders/{order['id']}").json()["cancelReason"] == "Ordered twice"


def test_qa28_categories_report_products_on_sale(client, make):
    parent = make.category(slug="home")
    seller = make.seller()
    from app.core.db import SessionLocal
    from app.data.models import Category

    with SessionLocal() as s:
        child = Category(name="Kitchen", slug="kitchen", parent_id=parent.id, variant_schema={"size": ["M"]})
        empty = Category(name="Beauty", slug="beauty", variant_schema={})
        s.add_all([child, empty])
        s.commit()
        child_obj = s.get(Category, child.id)
    listed_product(client, seller, child_obj, [{"sku": "A", "options": {"size": "M"}, "price": 1000, "onHand": 3}])
    counts = {c["slug"]: c["productCount"] for c in client.get(f"{API}/categories").json()["items"]}
    assert counts == {"home": 1, "kitchen": 1, "beauty": 0}
