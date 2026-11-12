"""Simulated payment gateway (decision 7). Shaped like a real one so it can be swapped later:

- a charge gets a provider reference and a hosted payment page the customer is sent to;
- the result arrives later as a signed webhook at /api/v1/webhooks/payments;
- refunds are requested server-to-server and also confirmed by webhook.
"""

import json
import secrets

import httpx

from app.core.config import get_settings
from app.core.security import sign_webhook


def new_reference(prefix: str = "pay") -> str:
    return f"{prefix}_sbx_{secrets.token_hex(8)}"


def hosted_page_url(payment_id: int) -> str:
    """The gateway's payment page. For the sandbox it's a page in our own web app."""
    return f"{get_settings().public_url}/sandbox/pay/{payment_id}"


def webhook_body(*, payment_id: int, provider_ref: str, kind: str, status: str, failure: str | None = None) -> bytes:
    payload = {
        "eventId": f"evt_{secrets.token_hex(8)}",
        "providerRef": provider_ref,
        "paymentId": str(payment_id),
        "kind": kind,
        "status": status,
    }
    if failure:
        payload["failureReason"] = failure
    return json.dumps(payload).encode()


def send_webhook(api_base: str, body: bytes) -> int:
    """POST a signed webhook to our API, exactly as the gateway would. Returns the HTTP status."""
    signature = sign_webhook(get_settings().payment_webhook_secret, body)
    response = httpx.post(
        f"{api_base}/api/v1/webhooks/payments",
        content=body,
        headers={"Content-Type": "application/json", "X-Signature": signature},
        timeout=10,
    )
    return response.status_code
