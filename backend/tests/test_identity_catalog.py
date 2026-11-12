import re

from conftest import PASSWORD, as_admin, as_user, listed_product, queued, run_jobs

API = "/api/v1"


def _link_token(email_body: str) -> str:
    return re.search(r"token=([\w.-]+)", email_body).group(1)


def test_sign_up_verify_and_sign_in(client, no_smtp):
    r = client.post(
        f"{API}/auth/signup",
        json={
            "email": "Sara@Example.com",
            "password": PASSWORD,
            "firstName": "Sara",
            "lastName": "Ahmed",
            "phone": "0301 2345678",
        },
    )
    assert r.status_code == 201, r.text
    assert r.json()["user"]["phone"] == "+923012345678"
    assert r.json()["user"]["emailVerified"] is False

    # Unverified users can't sign in.
    r = client.post(f"{API}/auth/signin", json={"email": "sara@example.com", "password": PASSWORD})
    assert r.status_code == 403 and r.json()["code"] == "email_not_verified"

    run_jobs()
    token = _link_token(no_smtp[-1]["body"])
    r = client.post(f"{API}/auth/verify-email", json={"token": token})
    assert r.status_code == 200 and r.json()["user"]["emailVerified"] is True
    assert client.get(f"{API}/me").status_code == 200  # verification signs in

    client.post(f"{API}/auth/signout")
    assert client.get(f"{API}/me").status_code == 401
    r = client.post(f"{API}/auth/signin", json={"email": "sara@example.com", "password": PASSWORD})
    assert r.status_code == 200 and client.get(f"{API}/me").status_code == 200


def test_sign_up_validation_and_duplicates(client):
    r = client.post(
        f"{API}/auth/signup",
        json={"email": "x@example.com", "password": "short", "firstName": "", "lastName": "L", "phone": "123"},
    )
    assert r.status_code == 400
    fields = r.json()["fieldErrors"]
    assert {"password", "firstName"} <= set(fields)
    good = {"email": "x@example.com", "password": PASSWORD, "firstName": "A", "lastName": "B", "phone": "03001234567"}
    assert client.post(f"{API}/auth/signup", json=good).status_code == 201
    r = client.post(f"{API}/auth/signup", json={**good, "email": "X@example.com"})
    assert r.status_code == 409 and r.json()["code"] == "email_taken"


def test_password_reset_link_works_once(client, make, no_smtp):
    user = make.user()
    assert client.post(f"{API}/auth/forgot-password", json={"email": user.email}).status_code == 202
    assert client.post(f"{API}/auth/forgot-password", json={"email": "nobody@example.com"}).status_code == 202
    run_jobs()
    assert len(no_smtp) == 1
    token = _link_token(no_smtp[0]["body"])
    assert client.post(f"{API}/auth/reset-password", json={"token": token, "password": "NewPass123"}).status_code == 204
    r = client.post(f"{API}/auth/reset-password", json={"token": token, "password": "Another123"})
    assert r.status_code == 400 and r.json()["code"] == "invalid_token"
    assert client.post(f"{API}/auth/signin", json={"email": user.email, "password": "NewPass123"}).status_code == 200


def test_addresses_first_is_default(client, make):
    as_user(client, make.user())
    base = {"recipient": "Ali", "phone": "0300 1234567", "line1": "Street 1", "city": "Lahore"}
    client.post(f"{API}/me/addresses", json={**base, "label": "Home"})
    r = client.post(f"{API}/me/addresses", json={**base, "label": "Office"})
    items = r.json()["items"]
    assert [a["label"] for a in items] == ["Home", "Office"] and items[0]["isDefault"]
    r = client.post(f"{API}/me/addresses/{items[1]['id']}/default")
    assert [a["label"] for a in r.json()["items"]] == ["Office", "Home"]
    r = client.post(f"{API}/me/addresses", json={**base, "label": "Bad", "phone": "12"})
    assert r.status_code == 400 and "phone" in r.json()["fieldErrors"]


def test_seller_application_and_admin_review(client, make):
    user, admin = make.user(), make.admin()
    as_user(client, user)
    r = client.post(f"{API}/me/seller-application", json={"shopName": "Kiln & Co"})
    assert r.json()["user"]["seller"]["status"] == "pending"
    assert client.get(f"{API}/seller/products").status_code == 403  # not approved yet

    client.cookies.clear()
    as_admin(client, admin)
    assert client.post(f"{API}/admin/sellers/{user.id}/suspend", json={"reason": "x"}).status_code == 409
    r = client.post(f"{API}/admin/sellers/{user.id}/approve")
    assert r.status_code == 200 and r.json()["seller"]["status"] == "approved"
    assert r.json()["reviewedBy"]["id"] == str(admin.id)

    client.cookies.clear()
    as_user(client, user)
    assert client.get(f"{API}/seller/products").status_code == 200

    # Admin routes refuse user tokens, and user routes refuse admin tokens.
    assert client.get(f"{API}/admin/users").status_code == 401


def test_catalog_variants_follow_category_schema(client, make):
    seller = make.seller()
    cat = make.category({"size": ["S", "M", "L"], "colour": ["Red", "Blue"]})
    as_user(client, seller)
    r = client.post(
        f"{API}/seller/products", json={"categoryId": str(cat.id), "name": "Tee", "optionNames": ["size", "weight"]}
    )
    assert r.status_code == 400 and "optionNames" in r.json()["fieldErrors"]
    pid = client.post(
        f"{API}/seller/products", json={"categoryId": str(cat.id), "name": "Tee", "optionNames": ["size", "colour"]}
    ).json()["id"]
    # Publishing needs an active variant.
    assert client.post(f"{API}/seller/products/{pid}/publish").json()["code"] == "no_active_variant"
    v = {"sku": "TEE-M-RED", "options": {"size": "M", "colour": "red"}, "price": 129900, "onHand": 5}
    r = client.post(f"{API}/seller/products/{pid}/variants", json=v)
    assert r.status_code == 201 and r.json()["options"] == {"size": "M", "colour": "Red"}  # normalised to schema
    assert (
        client.post(f"{API}/seller/products/{pid}/variants", json={**v, "sku": "OTHER"}).json()["code"]
        == "options_taken"
    )
    assert (
        client.post(
            f"{API}/seller/products/{pid}/variants", json={**v, "options": {"size": "L", "colour": "Red"}}
        ).json()["code"]
        == "sku_taken"
    )
    r = client.post(
        f"{API}/seller/products/{pid}/variants", json={**v, "sku": "TEE-XL", "options": {"size": "XL", "colour": "Red"}}
    )
    assert r.status_code == 400
    assert client.post(f"{API}/seller/products/{pid}/publish").status_code == 200

    # A different seller may reuse the SKU, but can't see or touch this product.
    other = make.seller()
    client.cookies.clear()
    as_user(client, other)
    assert client.get(f"{API}/seller/products/{pid}").status_code == 404
    other_pid = client.post(
        f"{API}/seller/products", json={"categoryId": str(cat.id), "name": "Tee 2", "optionNames": ["size", "colour"]}
    ).json()["id"]
    assert client.post(f"{API}/seller/products/{other_pid}/variants", json=v).status_code == 201

    # Public catalogue: only the published product, filterable by option.
    client.cookies.clear()
    r = client.get(f"{API}/products", params={"options[colour]": "Red"})
    assert [x["id"] for x in r.json()["items"]] == [pid]
    assert client.get(f"{API}/products", params={"options[colour]": "Blue"}).json()["items"] == []
    r = client.get(f"{API}/products/{pid}")
    assert r.json()["variants"][0]["available"] == 5 and r.json()["seller"]["shopName"] == seller.shop_name


def test_stock_cannot_drop_below_reserved_and_price_change_is_audited(client, make):
    seller, cat, admin = make.seller(), make.category(), make.admin()
    _, (variant,) = listed_product(
        client, seller, cat, [{"sku": "A", "options": {"size": "M"}, "price": 1000, "onHand": 3}]
    )
    as_user(client, seller)
    r = client.post(f"{API}/seller/variants/{variant['id']}/stock", json={"delta": -4, "reason": "count"})
    assert r.status_code == 409 and r.json()["code"] == "below_reserved"
    r = client.patch(f"{API}/seller/variants/{variant['id']}", json={"price": 1500})
    assert r.json()["price"] == 1500
    client.cookies.clear()
    as_admin(client, admin)
    log = client.get(f"{API}/admin/audit-log", params={"entityType": "variant", "entityId": variant["id"]}).json()
    change = next(e for e in log["items"] if e["action"] == "price_changed")
    assert change["data"]["before"]["price"] == 1000 and change["actorType"] == "user"


def test_suspended_seller_disappears_from_catalogue(client, make):
    seller, cat, admin = make.seller(), make.category(), make.admin()
    product, _ = listed_product(
        client, seller, cat, [{"sku": "A", "options": {"size": "M"}, "price": 1000, "onHand": 3}]
    )
    assert len(client.get(f"{API}/products").json()["items"]) == 1
    as_admin(client, admin)
    client.post(f"{API}/admin/sellers/{seller.id}/suspend", json={"reason": "Fake listings"})
    assert client.get(f"{API}/products").json()["items"] == []
    assert client.get(f"{API}/products/{product['id']}").status_code == 404
    assert queued("send_email")  # the seller is told
