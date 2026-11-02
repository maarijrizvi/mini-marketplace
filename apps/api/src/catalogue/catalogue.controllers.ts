import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { createProductSchema, productUpdateSchema, stockAdjustSchema, type CatalogueQuery, type SessionUser } from '@mm/shared';
import type { z } from 'zod';
import { ZodBody } from '../common/http.js';
import { CurrentUser, Public, Roles } from '../identity/auth.guard.js';
import { CatalogueService } from './catalogue.service.js';
import { SellerProductsService } from './seller-products.service.js';

@Public()
@Controller('catalogue')
export class CatalogueController {
  constructor(private readonly catalogue: CatalogueService) {}

  @Get('products')
  list(@Query() query: CatalogueQuery) {
    return this.catalogue.list(query);
  }

  @Get('products/:id')
  get(@Param('id', ParseUUIDPipe) id: string) {
    return this.catalogue.get(id);
  }

  @Get('categories')
  categories() {
    return this.catalogue.categories();
  }
}

@Roles('seller')
@Controller('seller/products')
export class SellerProductsController {
  constructor(private readonly products: SellerProductsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.products.list(user);
  }

  @Post()
  create(@CurrentUser() user: SessionUser, @Body(new ZodBody(createProductSchema)) body: z.output<typeof createProductSchema>) {
    return this.products.create(user, body);
  }

  @Patch(':id')
  update(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(productUpdateSchema)) body: z.output<typeof productUpdateSchema>,
  ) {
    return this.products.update(user, id, body);
  }

  @Post(':id/stock')
  adjustStock(
    @CurrentUser() user: SessionUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body(new ZodBody(stockAdjustSchema)) body: z.output<typeof stockAdjustSchema>,
  ) {
    return this.products.adjustStock(user, id, body);
  }

  @Get(':id/movements')
  movements(@CurrentUser() user: SessionUser, @Param('id', ParseUUIDPipe) id: string) {
    return this.products.movements(user, id);
  }
}
