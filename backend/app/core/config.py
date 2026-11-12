from functools import lru_cache

from pydantic import Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    """All runtime configuration, read from environment variables (and `.env` in development)."""

    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    environment: str = "development"
    database_url: str = "postgresql+psycopg://mm:mm@localhost:5432/mini_marketplace"

    # Public URL the browser uses; emailed links and sandbox redirects are built from it.
    public_url: str = "http://localhost:8080"
    # How the worker reaches the API (the simulated providers post their webhooks here).
    api_internal_url: str = "http://localhost:8000"

    jwt_secret: str = Field(default="dev-only-change-me-please-32-bytes-min", min_length=32)
    user_token_hours: int = 24 * 7
    admin_token_hours: int = 8
    email_token_minutes: int = 60 * 24
    reset_token_minutes: int = 30
    cookie_secure: bool = False

    smtp_host: str = "localhost"
    smtp_port: int = 1025
    mail_from: str = "Mini Marketplace <no-reply@mini-marketplace.local>"

    # Shared secrets the simulated providers use to sign their webhooks.
    payment_webhook_secret: str = "dev-payment-webhook-secret"
    leopards_webhook_secret: str = "dev-leopards-webhook-secret"
    sandbox_enabled: bool = True

    commission_bps: int = 1000  # 10 %, copied onto each order item at checkout
    shipping_fee_per_parcel: int = 25000  # Rs 250
    reservation_minutes: int = 15
    ship_deadline_business_hours: int = 24

    media_dir: str = "/app/media"
    max_upload_mb: int = 5

    seed_admin_email: str = "admin@mini-marketplace.local"
    seed_admin_password: str = "ChangeMe123"


@lru_cache
def get_settings() -> Settings:
    return Settings()
