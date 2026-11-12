import secrets
from pathlib import Path
from typing import Annotated

from fastapi import APIRouter, Query, UploadFile

from app.api import presenters as p
from app.api.deps import DB, FulfillingSeller, Seller
from app.api.errors import errors
from app.api.schemas.base import Id, PageOf
from app.api.schemas.catalog import (
    ProductInput,
    ProductUpdate,
    SellerProduct,
    SellerVariant,
    StockAdjustment,
    UploadOut,
    VariantInput,
    VariantUpdate,
)
from app.api.schemas.orders import Balance, DropItemRequest, LedgerEntryOut, SellerParcel
from app.core.config import get_settings
from app.core.errors import ApiError
from app.data.models import LedgerEntryType, ParcelStatus, ProductStatus
from app.services import catalog, fulfilment, money

router = APIRouter(responses=errors(401, 403))

# ── Products ───────────────────────────────────────────────────────────


@router.get("/seller/products", tags=["Seller catalog"], response_model=PageOf[SellerProduct])
def products(
    seller: Seller,
    s: DB,
    status: ProductStatus | None = None,
    q: str | None = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
):
    page = catalog.seller_products(s, seller, status=status, q=q, limit=limit, cursor=cursor)
    return PageOf[SellerProduct](items=[p.seller_product(x) for x in page.items], next_cursor=page.next_cursor)


@router.post(
    "/seller/products", tags=["Seller catalog"], status_code=201, response_model=SellerProduct, responses=errors(400)
)
def create_product(body: ProductInput, seller: Seller, s: DB):
    """Create a product as a draft. `optionNames` must be keys of the category's `variantSchema`."""
    return p.seller_product(catalog.create_product(s, seller, body.model_dump()))


@router.get(
    "/seller/products/{product_id}", tags=["Seller catalog"], response_model=SellerProduct, responses=errors(404)
)
def product(product_id: Id, seller: Seller, s: DB):
    return p.seller_product(catalog.own_product(s, seller, product_id))


@router.patch(
    "/seller/products/{product_id}",
    tags=["Seller catalog"],
    response_model=SellerProduct,
    responses=errors(400, 404, 409),
)
def update_product(product_id: Id, body: ProductUpdate, seller: Seller, s: DB):
    """Edit details. `optionNames` can only change while the product has no variants."""
    return p.seller_product(catalog.update_product(s, seller, product_id, body.model_dump(exclude_unset=True)))


@router.post(
    "/seller/products/{product_id}/publish",
    tags=["Seller catalog"],
    response_model=SellerProduct,
    responses=errors(404, 409),
)
def publish(product_id: Id, seller: Seller, s: DB):
    """draft → active. Needs at least one active variant."""
    return p.seller_product(catalog.publish(s, seller, product_id))


@router.post(
    "/seller/products/{product_id}/archive",
    tags=["Seller catalog"],
    response_model=SellerProduct,
    responses=errors(404, 409),
)
def archive(product_id: Id, seller: Seller, s: DB):
    """draft or active → archived. Past orders keep their snapshots."""
    return p.seller_product(catalog.archive(s, seller, product_id))


@router.post(
    "/seller/products/{product_id}/variants",
    tags=["Seller catalog"],
    status_code=201,
    response_model=SellerVariant,
    responses=errors(400, 404, 409),
)
def add_variant(product_id: Id, body: VariantInput, seller: Seller, s: DB):
    """`options` sets exactly the product's option names, from the category's allowed values."""
    return p.seller_variant(catalog.add_variant(s, seller, product_id, body.model_dump()))


@router.patch(
    "/seller/variants/{variant_id}",
    tags=["Seller catalog"],
    response_model=SellerVariant,
    responses=errors(400, 404, 409),
)
def update_variant(variant_id: Id, body: VariantUpdate, seller: Seller, s: DB):
    """A price change is audited and never alters placed orders."""
    return p.seller_variant(catalog.update_variant(s, seller, variant_id, body.model_dump(exclude_unset=True)))


@router.post(
    "/seller/variants/{variant_id}/stock",
    tags=["Seller catalog"],
    response_model=SellerVariant,
    responses=errors(400, 404, 409),
)
def adjust_stock(variant_id: Id, body: StockAdjustment, seller: Seller, s: DB):
    """Change `on_hand` by `delta` (can't drop below what's reserved). Audited with the reason."""
    return p.seller_variant(catalog.adjust_stock(s, seller, variant_id, body.delta, body.reason))


_IMAGE_TYPES = {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}


@router.post(
    "/seller/uploads", tags=["Seller catalog"], status_code=201, response_model=UploadOut, responses=errors(400)
)
async def upload_image(file: UploadFile, seller: Seller):
    """Upload a product image (JPEG, PNG or WebP, up to 5 MB). Returns the URL to put in `images`."""
    settings = get_settings()
    ext = _IMAGE_TYPES.get(file.content_type or "")
    if not ext:
        raise ApiError(400, "unsupported_file", "Upload a JPEG, PNG or WebP image.")
    data = await file.read(settings.max_upload_mb * 1024 * 1024 + 1)
    if len(data) > settings.max_upload_mb * 1024 * 1024:
        raise ApiError(400, "file_too_large", f"Images can be up to {settings.max_upload_mb} MB.")
    name = f"{seller.id}-{secrets.token_hex(8)}{ext}"
    folder = Path(settings.media_dir) / "products"
    folder.mkdir(parents=True, exist_ok=True)
    (folder / name).write_bytes(data)
    return UploadOut(url=f"/media/products/{name}")


# ── Parcels ────────────────────────────────────────────────────────────


@router.get("/seller/orders", tags=["Seller orders"], response_model=PageOf[SellerParcel])
def parcels(
    seller: FulfillingSeller,
    s: DB,
    status: ParcelStatus | None = None,
    late: Annotated[bool | None, Query(description="Only parcels not picked up by `ship_deadline`.")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
):
    """Own parcels. Unpaid online orders are hidden."""
    page = fulfilment.parcels(s, seller, status=status, late=late, limit=limit, cursor=cursor)
    return PageOf[SellerParcel](items=[p.seller_parcel(x) for x in page.items], next_cursor=page.next_cursor)


@router.get(
    "/seller/orders/{seller_order_id}", tags=["Seller orders"], response_model=SellerParcel, responses=errors(404)
)
def parcel(seller_order_id: Id, seller: FulfillingSeller, s: DB):
    return p.seller_parcel(fulfilment.parcel(s, seller, seller_order_id))


@router.post(
    "/seller/orders/{seller_order_id}/items/{item_id}/drop",
    tags=["Seller orders"],
    response_model=SellerParcel,
    responses=errors(404, 409),
)
def drop_item(seller_order_id: Id, item_id: Id, body: DropItemRequest, seller: FulfillingSeller, s: DB):
    """Drop an item you can't send (parcel must be pending). Stock is released; online orders are refunded for it,
    COD parcels collect less. Dropping the last item cancels the parcel."""
    return p.seller_parcel(fulfilment.drop_item(s, seller, seller_order_id, item_id, body.reason, body.note))


@router.post(
    "/seller/orders/{seller_order_id}/book-pickup",
    tags=["Seller orders"],
    status_code=202,
    response_model=SellerParcel,
    responses=errors(404, 409),
)
def book_pickup(seller_order_id: Id, seller: FulfillingSeller, s: DB):
    """Queue a Leopards pickup booking; the job stores `trackingNo`. Repeat calls are no-ops."""
    return p.seller_parcel(fulfilment.book_pickup(s, seller, seller_order_id))


# ── Money ──────────────────────────────────────────────────────────────


@router.get("/seller/ledger", tags=["Money"], response_model=PageOf[LedgerEntryOut])
def ledger(
    seller: FulfillingSeller,
    s: DB,
    entry_type: Annotated[LedgerEntryType | None, Query(alias="entryType")] = None,
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
):
    page = money.ledger(s, seller, entry_type=entry_type, limit=limit, cursor=cursor)
    return PageOf[LedgerEntryOut](items=[p.ledger_entry(x) for x in page.items], next_cursor=page.next_cursor)


@router.get("/seller/balance", tags=["Money"], response_model=Balance)
def balance(seller: FulfillingSeller, s: DB):
    """Sum of the seller's ledger entries."""
    return Balance(balance=money.balance(s, seller))
