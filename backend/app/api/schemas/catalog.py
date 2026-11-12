from datetime import datetime
from typing import Annotated

from pydantic import Field

from app.api.schemas.base import Camel, Id, Input, Money
from app.data.models import ProductStatus

Slug = Annotated[str, Field(pattern=r"^[a-z0-9]+(-[a-z0-9]+)*$", max_length=60)]
VariantSchema = Annotated[
    dict[str, list[str]],
    Field(description='Allowed values per option name, e.g. {"size": ["S","M"], "colour": ["red"]}.'),
]
VariantOptions = Annotated[dict[str, str], Field(description='One value per option, e.g. {"size": "M"}.')]
ImageUrl = Annotated[str, Field(max_length=500, description="An uploaded image path (/media/…) or an https URL.")]
Sku = Annotated[str, Field(pattern=r"^[A-Za-z0-9._-]{1,40}$")]


class CategoryOut(Camel):
    id: Id
    parent_id: Id | None
    name: str
    slug: str
    variant_schema: dict[str, list[str]]


class CategoryList(Camel):
    items: list[CategoryOut]


class CategoryInput(Input):
    name: str = Field(min_length=1, max_length=60)
    slug: Slug
    parent_id: Id | None = None
    variant_schema: VariantSchema | None = None


class CategoryUpdate(Input):
    name: str | None = Field(default=None, min_length=1, max_length=60)
    slug: Slug | None = None
    parent_id: Id | None = None
    variant_schema: VariantSchema | None = None


class SellerRef(Camel):
    id: Id
    shop_name: str


class ProductSummary(Camel):
    id: Id
    name: str
    seller: SellerRef
    category_id: Id
    image: str | None
    price_from: Money
    price_to: Money
    in_stock: bool


class VariantOut(Camel):
    id: Id
    options: dict[str, str]
    price: Money
    available: int
    images: list[str]


class ProductDetail(Camel):
    id: Id
    name: str
    description: str
    seller: SellerRef
    category: CategoryOut
    option_names: list[str]
    images: list[str]
    variants: list[VariantOut]


class ProductInput(Input):
    category_id: Id
    name: str = Field(min_length=2, max_length=120)
    description: str = Field(default="", max_length=5000)
    option_names: list[str] = Field(default_factory=list, max_length=4)
    images: list[ImageUrl] = Field(default_factory=list, max_length=10)


class ProductUpdate(Input):
    category_id: Id | None = None
    name: str | None = Field(default=None, min_length=2, max_length=120)
    description: str | None = Field(default=None, max_length=5000)
    option_names: list[str] | None = Field(default=None, max_length=4)
    images: list[ImageUrl] | None = Field(default=None, max_length=10)


class SellerVariant(Camel):
    id: Id
    sku: str
    options: dict[str, str]
    price: Money
    on_hand: int
    reserved: int
    available: int
    images: list[str]
    is_active: bool


class SellerProduct(Camel):
    id: Id
    category_id: Id
    name: str
    description: str
    option_names: list[str]
    images: list[str]
    status: ProductStatus
    variants: list[SellerVariant]
    created_at: datetime
    updated_at: datetime


class VariantInput(Input):
    sku: Sku
    options: VariantOptions = Field(default_factory=dict)
    price: Money = Field(gt=0)
    on_hand: int = Field(ge=0, le=100_000)
    images: list[ImageUrl] = Field(default_factory=list, max_length=10)


class VariantUpdate(Input):
    sku: Sku | None = None
    price: int | None = Field(default=None, gt=0)
    images: list[ImageUrl] | None = Field(default=None, max_length=10)
    is_active: bool | None = None


class StockAdjustment(Input):
    delta: int = Field(ge=-100_000, le=100_000)
    reason: str = Field(min_length=1, max_length=200)


class UploadOut(Camel):
    url: str
