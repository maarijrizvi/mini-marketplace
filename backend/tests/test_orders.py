import threading

from conftest import as_admin, as_user, listed_product, queued, run_jobs, with_address
from fastapi.testclient import TestClient
from sqlalchemy import text

from app.core.db import engine
from app.main import app

API = "/api/v1"
FEE = 25000


def _stock(variant_id: str) -> tuple[int, int]:
    with engine.begin() as conn:
        return tuple(
            conn.execute(
                text("SELECT on_hand, reserved FROM product_variants WHERE id = :id"), {"id": int(variant_id)}
            ).one()
        )


def _setup_two_sellers(client, make, on_hand=5):
    cat = make.category()
    s1, s2 = make.seller("Kiln & Co"), make.seller("Northfield")
    _, (v1,) = listed_product(
        client, s1, cat, [{"sku": "MUG", "options": {"size": "M"}, "price": 380000, "onHand": on_hand}], name="Mug"
    )
    _, (v2,) = listed_product(
        client, s2, cat, [{"sku": "THROW", "options": {"size": "L"}, "price": 680000, "onHand": on_hand}], name="Throw"
    )
    return s1, s2, v1, v2


def _checkout(client, address_id, method="cod", key="key-00000001", expected=None):
    if expected is None:
        expected = client.post(f"{API}/checkout/quote", json={"addressId": address_id}).json()["total"]
    return client.post(
        f"{API}/checkout",
        json={"addressId": address_id, "paymentMethod": method, "expectedTotal": expected},
        headers={"Idempotency-Key": key},
    )


def test_cod_checkout_splits_parcels_and_is_idempotent(client, make, no_smtp):
    s1, s2, v1, v2 = _setup_two_sellers(client, make)
    buyer = make.user()
    addr = with_address(client, buyer)
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 2})
    client.post(f"{API}/me/cart/items", json={"variantId": v2["id"], "quantity": 1})

    q = client.post(f"{API}/checkout/quote", json={"addressId": addr}).json()
    assert len(q["parcels"]) == 2 and q["shippingTotal"] == 2 * FEE
    assert q["total"] == 2 * 380000 + 680000 + 2 * FEE

    r = _checkout(client, addr)
    assert r.status_code == 201, r.text
    order = r.json()["order"]
    assert order["status"] == "placed" and order["paymentMethod"] == "cod" and r.json()["payment"] is None
    cods = sorted(p["codAmount"] for p in order["parcels"])
    assert cods == sorted([2 * 380000 + FEE, 680000 + FEE])
    assert all(i["reservation"] == "committed" for p in order["parcels"] for i in p["items"])
    assert _stock(v1["id"]) == (3, 0)  # committed: on_hand down, nothing left reserved
    assert client.get(f"{API}/me/cart").json()["groups"] == []

    # Same key again: the same order, 200 not 201, no second stock movement.
    r = _checkout(client, addr, expected=order["total"])
    assert r.status_code == 200 and r.json()["order"]["id"] == order["id"]
    assert _stock(v1["id"]) == (3, 0)

    run_jobs()
    assert any("confirmed" in m["subject"] for m in no_smtp)

    # Each seller sees only their own parcel; the customer can't see another customer's order.
    as_user(client, s1)
    parcels = client.get(f"{API}/seller/orders").json()["items"]
    assert len(parcels) == 1 and parcels[0]["items"][0]["sku"] == "MUG"
    assert parcels[0]["items"][0]["commissionBps"] == 1000
    as_user(client, make.user())
    assert client.get(f"{API}/me/orders/{order['id']}").status_code == 404


def test_price_change_after_quote_is_caught(client, make):
    s1, _, v1, _ = _setup_two_sellers(client, make)
    buyer = make.user()
    addr = with_address(client, buyer)
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1})
    seen = client.post(f"{API}/checkout/quote", json={"addressId": addr}).json()["total"]
    as_user(client, s1)
    client.patch(f"{API}/seller/variants/{v1['id']}", json={"price": 400000})
    as_user(client, buyer)
    r = _checkout(client, addr, expected=seen)
    assert r.status_code == 409 and r.json()["code"] == "prices_changed"
    assert r.json()["details"]["total"] == 400000 + FEE
    assert _checkout(client, addr, expected=400000 + FEE, key="key-00000002").status_code == 201


def test_last_unit_goes_to_exactly_one_buyer(client, make):
    _, _, v1, _ = _setup_two_sellers(client, make, on_hand=1)
    buyers = [make.user() for _ in range(4)]
    clients = []
    for b in buyers:
        c = TestClient(app)
        addr = with_address(c, b)
        assert c.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1}).status_code == 200
        clients.append((c, addr))

    results: list[int] = []
    barrier = threading.Barrier(len(clients))

    def buy(c, addr):
        barrier.wait()
        r = c.post(
            f"{API}/checkout",
            json={"addressId": addr, "paymentMethod": "cod", "expectedTotal": 380000 + FEE},
            headers={"Idempotency-Key": "race-key-1"},
        )
        results.append(r.status_code)

    threads = [threading.Thread(target=buy, args=pair) for pair in clients]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(results) == [201, 409, 409, 409]
    assert _stock(v1["id"]) == (0, 0)


def test_concurrent_same_key_makes_one_order(client, make):
    _, _, v1, _ = _setup_two_sellers(client, make)
    buyer = make.user()
    addr = with_address(client, buyer)
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1})
    codes, ids = [], []
    barrier = threading.Barrier(3)

    def go():
        c = TestClient(app)
        c.cookies = client.cookies
        barrier.wait()
        r = _checkout(c, addr, key="same-key-123", expected=380000 + FEE)
        codes.append(r.status_code)
        ids.append(r.json().get("order", {}).get("id"))

    threads = [threading.Thread(target=go) for _ in range(3)]
    [t.start() for t in threads]
    [t.join() for t in threads]
    assert sorted(codes) == [200, 200, 201] and len(set(ids)) == 1
    assert _stock(v1["id"]) == (4, 0)


def test_customer_cancel_releases_stock_until_pickup(client, make):
    s1, _, v1, _ = _setup_two_sellers(client, make)
    buyer = make.user()
    addr = with_address(client, buyer)
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 2})
    order = _checkout(client, addr).json()["order"]
    assert _stock(v1["id"]) == (3, 0)
    r = client.post(f"{API}/me/orders/{order['id']}/cancel", json={"reason": "Changed my mind"})
    assert r.status_code == 200 and r.json()["status"] == "cancelled"
    assert r.json()["parcels"][0]["status"] == "cancelled"
    assert _stock(v1["id"]) == (5, 0)
    assert client.post(f"{API}/me/orders/{order['id']}/cancel").json()["code"] == "invalid_transition"

    # After pickup, cancelling is refused.
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1})
    order = _checkout(client, addr, key="key-00000009").json()["order"]
    parcel_id = order["parcels"][0]["id"]
    as_user(client, s1)
    client.post(f"{API}/seller/orders/{parcel_id}/book-pickup")
    run_jobs()
    tracking = client.get(f"{API}/seller/orders/{parcel_id}").json()["trackingNo"]
    client.post(f"{API}/sandbox/leopards/{tracking}/events", json={"event": "picked_up"})
    run_jobs()
    as_user(client, buyer)
    r = client.post(f"{API}/me/orders/{order['id']}/cancel")
    assert r.status_code == 409 and r.json()["code"] == "invalid_transition"


def test_cod_delivery_records_cash_ledger_and_completes(client, make):
    s1, s2, v1, v2 = _setup_two_sellers(client, make)
    buyer, admin = make.user(), make.admin()
    addr = with_address(client, buyer)
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1})
    client.post(f"{API}/me/cart/items", json={"variantId": v2["id"], "quantity": 1})
    order = _checkout(client, addr).json()["order"]
    by_seller = {p["seller"]["shopName"]: p["id"] for p in order["parcels"]}

    # Seller 2 can't send theirs and drops it: that parcel is cancelled and collects nothing.
    as_user(client, s2)
    p2 = client.get(f"{API}/seller/orders/{by_seller['Northfield']}").json()
    r = client.post(f"{API}/seller/orders/{p2['id']}/items/{p2['items'][0]['id']}/drop", json={"reason": "damaged"})
    assert r.json()["status"] == "cancelled" and r.json()["codAmount"] == 0
    assert _stock(v2["id"]) == (5, 0)

    # Seller 1 books a pickup; Leopards picks it up and delivers it.
    as_user(client, s1)
    pid = by_seller["Kiln & Co"]
    assert client.post(f"{API}/seller/orders/{pid}/book-pickup").status_code == 202
    run_jobs()
    tracking = client.get(f"{API}/seller/orders/{pid}").json()["trackingNo"]
    assert tracking
    for event in ("picked_up", "delivered", "delivered"):  # a repeated scan changes nothing
        assert client.post(f"{API}/sandbox/leopards/{tracking}/events", json={"event": event}).status_code == 202
        run_jobs()

    as_user(client, buyer)
    order = client.get(f"{API}/me/orders/{order['id']}").json()
    assert order["status"] == "completed"
    cod = [x for x in order["payments"] if x["method"] == "cod"]
    assert len(cod) == 1 and cod[0]["amount"] == 380000 + FEE and cod[0]["status"] == "succeeded"

    as_user(client, s1)
    entries = {e["entryType"]: e["amount"] for e in client.get(f"{API}/seller/ledger").json()["items"]}
    assert entries == {"sale": 380000, "commission": -38000}
    assert client.get(f"{API}/seller/balance").json()["balance"] == 342000

    # Payouts: idempotent by key, never more than the balance.
    client.cookies.clear()
    as_admin(client, admin)
    body = {"amount": 300000}
    r = client.post(f"{API}/admin/sellers/{s1.id}/payouts", json=body, headers={"Idempotency-Key": "payout-0001"})
    assert r.status_code == 201
    r2 = client.post(f"{API}/admin/sellers/{s1.id}/payouts", json=body, headers={"Idempotency-Key": "payout-0001"})
    assert r2.status_code == 200 and r2.json()["id"] == r.json()["id"]
    r = client.post(f"{API}/admin/sellers/{s1.id}/payouts", json=body, headers={"Idempotency-Key": "payout-0002"})
    assert r.status_code == 409 and r.json()["code"] == "insufficient_balance"


def test_online_payment_success_failure_and_expiry(client, make):
    _, _, v1, _ = _setup_two_sellers(client, make)
    buyer = make.user()
    addr = with_address(client, buyer)

    # Success: held while waiting, committed when the gateway confirms.
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1})
    r = _checkout(client, addr, method="card", key="online-0001")
    order, payment = r.json()["order"], r.json()["payment"]
    assert order["status"] == "pending_payment" and payment["redirectUrl"].endswith(
        f"/sandbox/pay/{payment['paymentId']}"
    )
    assert order["reservedUntil"] and _stock(v1["id"]) == (5, 1)
    as_user(client, make.seller())  # sellers don't see unpaid orders
    assert client.get(f"{API}/seller/orders").json()["items"] == []
    as_user(client, buyer)
    client.post(f"{API}/sandbox/payments/{payment['paymentId']}/complete", json={"outcome": "succeeded"})
    run_jobs()
    order = client.get(f"{API}/me/orders/{order['id']}").json()
    assert order["status"] == "placed" and _stock(v1["id"]) == (4, 0)

    # Failure: the stock goes back and the order is cancelled.
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 2})
    r = _checkout(client, addr, method="wallet", key="online-0002")
    assert _stock(v1["id"]) == (4, 2)
    client.post(f"{API}/sandbox/payments/{r.json()['payment']['paymentId']}/complete", json={"outcome": "failed"})
    run_jobs()
    assert client.get(f"{API}/me/orders/{r.json()['order']['id']}").json()["status"] == "cancelled"
    assert _stock(v1["id"]) == (4, 0)

    # No answer: the hold expires (the job runs at reserved_until), then a late success is refunded.
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1})
    r = _checkout(client, addr, method="card", key="online-0003")
    oid, pay_id = r.json()["order"]["id"], r.json()["payment"]["paymentId"]
    with engine.begin() as conn:
        conn.execute(text("UPDATE order_items SET reserved_until = now() - interval '1 minute'"))
    run_jobs(include_scheduled=True)
    assert client.get(f"{API}/me/orders/{oid}").json()["status"] == "cancelled" and _stock(v1["id"]) == (4, 0)
    client.post(f"{API}/sandbox/payments/{pay_id}/complete", json={"outcome": "succeeded"})
    run_jobs()
    o = client.get(f"{API}/me/orders/{oid}").json()
    refunds = [x for x in o["payments"] if x["kind"] == "refund"]
    assert o["status"] == "cancelled" and len(refunds) == 1 and refunds[0]["status"] == "succeeded"
    assert o["refunded"] == o["total"]


def test_online_drop_refunds_the_item(client, make):
    s1, _, v1, _ = _setup_two_sellers(client, make)
    buyer = make.user()
    addr = with_address(client, buyer)
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1})
    r = _checkout(client, addr, method="card", key="online-0010")
    client.post(f"{API}/sandbox/payments/{r.json()['payment']['paymentId']}/complete", json={"outcome": "succeeded"})
    run_jobs()
    parcel = r.json()["order"]["parcels"][0]
    as_user(client, s1)
    client.post(
        f"{API}/seller/orders/{parcel['id']}/items/{parcel['items'][0]['id']}/drop", json={"reason": "out_of_stock"}
    )
    assert queued("issue_refund")
    run_jobs()
    as_user(client, buyer)
    o = client.get(f"{API}/me/orders/{r.json()['order']['id']}").json()
    # The item and, since the parcel is now empty, its shipping fee: the whole order back.
    assert o["refunded"] == 380000 + FEE and o["status"] == "cancelled"
    assert _stock(v1["id"]) == (5, 0)


def test_webhooks_need_a_valid_signature(client):
    r = client.post(f"{API}/webhooks/payments", content=b'{"x":1}', headers={"X-Signature": "nope"})
    assert r.status_code == 401 and r.json()["code"] == "bad_signature"


def test_admin_sees_jobs_and_orders(client, make):
    _, _, v1, _ = _setup_two_sellers(client, make)
    buyer, admin = make.user(), make.admin()
    addr = with_address(client, buyer)
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1})
    order = _checkout(client, addr).json()["order"]
    client.cookies.clear()
    as_admin(client, admin)
    assert client.get(f"{API}/admin/orders", params={"q": buyer.email}).json()["items"][0]["id"] == order["id"]
    jobs = client.get(f"{API}/admin/jobs", params={"state": "queued"}).json()["items"]
    assert {j["task"] for j in jobs} == {"send_email"}
    assert client.get(f"{API}/admin/jobs/counts").json()["queued"] == len(jobs)
    assert client.delete(f"{API}/admin/jobs/{jobs[0]['id']}").status_code == 204
    r = client.post(f"{API}/admin/orders/{order['id']}/cancel", json={"reason": "Fraud check"})
    assert r.json()["status"] == "cancelled"


def test_suspended_seller_still_fulfils_but_cannot_list(client, make):
    s1, _, v1, _ = _setup_two_sellers(client, make)
    buyer, admin = make.user(), make.admin()
    addr = with_address(client, buyer)
    client.post(f"{API}/me/cart/items", json={"variantId": v1["id"], "quantity": 1})
    order = _checkout(client, addr).json()["order"]
    client.cookies.clear()
    as_admin(client, admin)
    client.post(f"{API}/admin/sellers/{s1.id}/suspend", json={"reason": "Late shipping"})
    client.cookies.clear()
    as_user(client, s1)
    assert client.get(f"{API}/seller/products").status_code == 403
    parcel_id = order["parcels"][0]["id"]
    assert client.post(f"{API}/seller/orders/{parcel_id}/book-pickup").status_code == 202
