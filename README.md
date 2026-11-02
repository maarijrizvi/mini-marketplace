# Mini Marketplace

A multi-vendor marketplace: customers buy from several sellers in one checkout, sellers manage their own products and fulfilment, admins run the marketplace. Built to the brief in [docs/reference/project-specification.pdf](docs/reference/project-specification.pdf); the screens follow the design canvas in [docs/reference](docs/reference).

## What’s here

| Path              | What it is                                                                                                 |
| ----------------- | ---------------------------------------------------------------------------------------------------------- |
| `apps/api`        | NestJS API. Prisma + PostgreSQL. Server-side sessions, roles, audit log, transactional outbox.             |
| `apps/worker`     | Background worker. Publishes the outbox to SQS, handles events (emails today), retries and dead-lettering. |
| `apps/web`        | Next.js web app.                                                                                           |
| `packages/shared` | Validation rules and message contracts used by all three.                                                  |
| `infra`           | Local infrastructure (LocalStack queue setup). Terraform and Kubernetes manifests arrive with deployment.  |
| `docs/adr`        | Architecture decisions and why.                                                                            |

## Run it locally

Needs Node 24+ and Docker.

```bash
cp .env.example .env
npm install
npm run infra:up          # Postgres, LocalStack (SQS), Mailpit
npm run db:generate --workspace @mm/api
npm run build --workspace @mm/shared
npm run db:migrate        # apply migrations
npm run db:seed           # categories, a dev admin and demo shops/products (see .env)
```

Then, in three terminals:

```bash
npm run dev:api      # http://localhost:4000/api
npm run dev:worker
npm run dev:web      # http://localhost:3000
```

Emails (verification codes, reset links, order confirmations) land in Mailpit at http://localhost:8025.

With `SEED_DEMO_PASSWORD` set, the seed adds five demo shops (`kiln@example.com`, …) and a customer, `alex@example.com`, all using that password. Checkout uses a sandbox payment provider: pick Success, Failure, Pending or Unknown on the checkout page.

## Tests

```bash
npm test                                   # unit tests
npm run test:e2e --workspace @mm/api       # API against real Postgres
npm run test:e2e --workspace @mm/worker    # outbox → SQS → email, retries, DLQ
```

End-to-end tests use a separate `mini_marketplace_test` database, created and migrated automatically, so they never touch development data.

## API

All routes are under `/api`. Errors come back as `{ message, code?, fieldErrors? }`.

| Method | Path                            | Notes                                                                |
| ------ | ------------------------------- | -------------------------------------------------------------------- |
| POST   | `/auth/signup`                  | Customer account; emails a 6-digit code                              |
| POST   | `/auth/seller-signup`           | Separate seller login + pending shop; linked to a signed-in customer |
| POST   | `/auth/verify-email`            | Confirms the code and signs in                                       |
| POST   | `/auth/resend-code`             | New code, at most once a minute                                      |
| POST   | `/auth/signin`                  | Pauses sign-in for 15 minutes after 5 wrong passwords                |
| POST   | `/auth/signout`                 | Revokes the session                                                  |
| GET    | `/auth/me`                      | Current user                                                         |
| POST   | `/auth/forgot-password`         | Same answer whether or not the email exists                          |
| POST   | `/auth/reset-password`          | One-time link; unlocks the account and signs out every device        |
| GET    | `/health/live`, `/health/ready` | Kubernetes probes                                                    |

| Method              | Path                                       | Who      | Notes                                                                |
| ------------------- | ------------------------------------------ | -------- | -------------------------------------------------------------------- |
| GET                 | `/catalogue/products`, `/products/:id`     | anyone   | Search, category/price/stock filters, sorts, facets; live shops only |
| GET                 | `/catalogue/categories`                    | anyone   |                                                                      |
| GET, POST           | `/seller/products`                         | seller   | Own shop only; drafts until the shop is approved                     |
| PATCH               | `/seller/products/:id`                     | seller   | Price changes are audited and never touch placed orders              |
| POST, GET           | `/seller/products/:id/stock`, `/movements` | seller   | Adjust on-hand (can’t go below reserved); movement history           |
| GET                 | `/cart`                                    | customer | Grouped by seller, with selection and availability                   |
| POST, PATCH, DELETE | `/cart/items[/:productId]`                 | customer | `selectOnly` = Buy now                                               |
| POST                | `/cart/selection`, `/cart/remove-selected` | customer | Tick/untick items; remove the ticked ones                            |
| POST                | `/cart/merge`                              | customer | Folds the guest cart in after sign-in                                |
| GET, POST, DELETE   | `/addresses[/:id]`, `POST /:id/default`    | customer |                                                                      |
| POST                | `/checkout/quote`                          | customer | Per-seller totals, shipping, promo                                   |
| POST                | `/checkout`                                | customer | Idempotent by key; reserves stock, pays, settles (see ADR 0004)      |
| GET                 | `/orders`, `/orders/:id`                   | customer | Own orders only                                                      |

## Status

- Milestone 1 (foundation and accounts): done.
- Milestone 2 (catalogue, cart and multi-seller checkout): done. Stock reservation rules are in [ADR 0004](docs/adr/0004-inventory-reservations-and-checkout.md).
- Next: seller fulfilment (confirm, pack, ship per shipment) and the admin console (seller approval, moderation). Pausing a shop isn’t modelled yet.
