import { Module } from '@nestjs/common';
import { CartController } from './cart/cart.controller.js';
import { CartService } from './cart/cart.service.js';
import { CatalogueController, SellerProductsController } from './catalogue/catalogue.controllers.js';
import { CatalogueService } from './catalogue/catalogue.service.js';
import { SellerProductsService } from './catalogue/seller-products.service.js';
import { AddressesController, AddressesService } from './ordering/addresses.js';
import { CheckoutService } from './ordering/checkout.service.js';
import { CheckoutController, OrdersController } from './ordering/ordering.controllers.js';
import { PaymentProvider } from './ordering/payment-provider.js';
import { ReservationSweeper } from './ordering/reservation-sweeper.js';
import { SettlementService } from './ordering/settlement.service.js';

/** Catalogue, Cart and Ordering contexts. Split into separate modules as they grow. */
@Module({
  controllers: [CatalogueController, SellerProductsController, CartController, AddressesController, CheckoutController, OrdersController],
  providers: [
    CatalogueService,
    SellerProductsService,
    CartService,
    AddressesService,
    CheckoutService,
    PaymentProvider,
    SettlementService,
    ReservationSweeper,
  ],
})
export class CommerceModule {}
