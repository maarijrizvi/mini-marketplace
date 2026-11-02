# 4. Inventory reservations and multi-seller checkout

Date: 2026-11-02 · Status: accepted

## Problem

One checkout can buy from several sellers, and payment happens through an outside provider that can succeed, fail, stay pending or time out. The spec asks that two customers can never buy the same last unit, that a double-clicked “Place order” never charges twice, and that stock held for an unpaid order comes back if the payment never completes.

## Decision

1. **Stock has two numbers.** `stock_items.on_hand` is what the seller physically has; `reserved` is held for orders awaiting payment. Available = `on_hand − reserved`. A CHECK keeps `0 ≤ reserved ≤ on_hand`. Every change writes an `inventory_movements` row (`restock`, `adjust`, `reserve`, `commit`, `release`), so stock can always be explained.
2. **Reserve in one transaction, in a fixed order.** Checkout locks the `stock_items` rows with `SELECT … FOR UPDATE`, ordered by product id so two overlapping checkouts can’t deadlock. It checks availability, creates the order, one `seller_order` per shop and the items (prices copied, so later listing changes don’t touch past orders), raises `reserved`, records a `stock_reservation` (held, expires in 15 minutes) and creates the payment row. If any line is short, nothing is written and the customer gets `409 insufficient_stock`. The second buyer of a last unit waits on the row lock, then sees it gone.
3. **Call the provider outside the transaction.** A slow or hung provider never holds row locks. The call carries the payment’s idempotency key, so a retry can’t create a second charge.
4. **Settle by outcome** (`SettlementService`, the only code that moves a reservation out of `held`):
   - **succeeded**: `on_hand −= q`, `reserved −= q`, reservations `committed`, order `placed`, bought items leave the cart, outbox `ordering.order_placed`.
   - **failed**: `reserved −= q`, reservations `released`, order `payment_failed`, seller orders `cancelled`; the items stay in the cart so the customer can retry. Outbox `ordering.payment_failed`.
   - **pending / unknown**: nothing moves; stock stays held until the provider answers or the hold expires.
     Settlement only acts on a payment still unresolved, under a row lock, so a late provider answer and the expiry sweep can’t both apply.
5. **Expiry sweep.** `ReservationSweeper` runs in the API process every 60 seconds and settles any order whose holds have expired as failed. Several API replicas are safe because settlement locks the payment row and skips anything already resolved. `RESERVATION_SWEEP=off` turns it off (tests drive it directly).
6. **Idempotent checkout.** The client sends an `idempotencyKey` (one per checkout attempt, reused on retry). `orders.idempotency_key` is unique: a repeat returns the original order with 200 instead of 201, and two concurrent requests with the same key produce one order (the loser hits the unique index and reads the winner’s order).
7. **Price check.** The client sends the total it showed; if the server’s quote differs, checkout returns `409 prices_changed` with the new quote instead of charging a different amount.

## Consequences

- An expired hold is treated as failed. If the provider later reports success for it, the payment needs a refund; that reconciliation arrives with the payments work in a later milestone.
- The sweeper lives in the API rather than the worker because it changes stock and orders, which the API owns. It could move to a Kubernetes CronJob without code changes.
- Shipping is a flat $5 per seller and the only promotion is `WELCOME10` (10% off goods, split across sellers by largest remainder so the parts add up to the total).
- Covered by `apps/api/test/commerce.e2e-spec.ts`: last-unit race, concurrent same-key checkout, failure release, unknown hold then sweep, `prices_changed`, prices copied into orders.
