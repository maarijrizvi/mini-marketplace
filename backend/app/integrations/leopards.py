"""Simulated Leopards Courier (decision 8): books pickups and sends parcel events as signed webhooks."""

import json
import secrets
from datetime import UTC, datetime

import httpx

from app.core.config import get_settings
from app.core.security import sign_webhook


def book_pickup(parcel_id: int) -> str:
    """Book a pickup and return the tracking number. The real API would also return a label."""
    return f"LP{parcel_id:08d}{secrets.randbelow(100):02d}"


def webhook_body(tracking_no: str, event: str, cod_collected: int | None = None) -> bytes:
    payload = {
        "eventId": f"lp_{secrets.token_hex(8)}",
        "trackingNo": tracking_no,
        "event": event,
        "occurredAt": datetime.now(UTC).isoformat(),
    }
    if cod_collected is not None:
        payload["codCollected"] = cod_collected
    return json.dumps(payload).encode()


def send_webhook(api_base: str, body: bytes) -> int:
    signature = sign_webhook(get_settings().leopards_webhook_secret, body)
    response = httpx.post(
        f"{api_base}/api/v1/webhooks/leopards",
        content=body,
        headers={"Content-Type": "application/json", "X-Signature": signature},
        timeout=10,
    )
    return response.status_code
