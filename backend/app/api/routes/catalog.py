from typing import Annotated, Literal

from fastapi import APIRouter, Query, Request

from app.api import presenters as p
from app.api.deps import DB
from app.api.errors import errors
from app.api.schemas.base import Id, PageOf
from app.api.schemas.catalog import CategoryList, CategoryOut, ProductDetail, ProductSummary
from app.services import catalog

router = APIRouter(tags=["Catalog"])


@router.get("/categories", response_model=CategoryList)
def categories(s: DB):
    """All categories as a flat list with `parentId`; clients build the tree."""
    counts = catalog.product_counts(s)
    return CategoryList(items=[p.category(c, counts.get(c.id, 0)) for c in catalog.categories(s)])


@router.get("/categories/{slug}", response_model=CategoryOut, responses=errors(404))
def category(slug: str, s: DB):
    return p.category(catalog.category_by_slug(s, slug))


@router.get("/products", response_model=PageOf[ProductSummary], responses=errors(400, 404))
def products(
    request: Request,
    s: DB,
    q: Annotated[str | None, Query(max_length=100)] = None,
    category: Annotated[str | None, Query(description="Category slug; includes sub-categories.")] = None,
    min_price: Annotated[int | None, Query(alias="minPrice", ge=0)] = None,
    max_price: Annotated[int | None, Query(alias="maxPrice", ge=0)] = None,
    in_stock: Annotated[bool | None, Query(alias="inStock")] = None,
    sort: Literal["relevance", "newest", "price_asc", "price_desc"] = "relevance",
    limit: Annotated[int, Query(ge=1, le=100)] = 20,
    cursor: str | None = None,
):
    """Browse and search. Only active products of approved sellers with an active variant.

    Variant option filters use `options[name]=value`, e.g. `options[colour]=red&options[size]=M`.
    """
    options = {
        key[8:-1].lower(): value
        for key, value in request.query_params.items()
        if key.startswith("options[") and key.endswith("]") and value
    }
    page = catalog.search(
        s,
        q=q,
        category=category,
        min_price=min_price,
        max_price=max_price,
        options=options,
        in_stock=in_stock,
        sort=sort,
        limit=limit,
        cursor=cursor,
    )
    return PageOf[ProductSummary](items=[p.product_summary(r) for r in page.items], next_cursor=page.next_cursor)


@router.get("/products/{product_id}", response_model=ProductDetail, responses=errors(404))
def product(product_id: Id, s: DB):
    return p.product_detail(catalog.product_detail(s, product_id))
