# Mini Marketplace

A multi-seller marketplace: customers fill one cart from many shops, pay once (card, mobile wallet or cash on
delivery), and every seller ships their own parcel through Leopards Courier. Built from [`the_ERD.pdf`](the_ERD.pdf)
and the API design in [`docs/api/openapi.yaml`](docs/api/openapi.yaml).

| Part | Stack |
| --- | --- |
| `backend/` | FastAPI · SQLAlchemy 2 · PostgreSQL 17 · Alembic · Procrastinate (Postgres job queue) |
| `frontend/` | Next.js 16 · React 19 · TanStack Query · API client typed from the backend's OpenAPI schema |
| `deploy/` | nginx config and a one-command deploy script for a DigitalOcean droplet |
| `docker-compose.yml` | db, api, worker, web, mailpit and nginx, all behind port 80 |

## Layers

Each side keeps presentation, business rules and data access apart; a layer only calls the one below it.

```
backend/app
├── api/            UI layer: routes, request/response schemas, presenters, auth dependencies, error mapping
├── services/       Business layer: checkout, stock holds, payments, fulfilment, refunds, ledger, admin rules
├── data/           Data access: ORM models (the ERD) and repositories — the only code that writes SQL
├── integrations/   Outside systems: simulated payment gateway, simulated Leopards, SMTP
├── jobs/           Background tasks (Procrastinate), each calling into services
└── core/           Settings, database session, security (passwords, JWT, webhook signatures)

frontend/src
├── app/, components/   UI layer: pages and presentational components
├── features/           Business layer: hooks and rules (formatting, statuses, idempotency keys, guards)
└── lib/api/            Data access: the typed HTTP client and one function per endpoint
```

## Run it locally

Needs Docker.

```bash
cp .env.example .env        # then set the change-me values; PUBLIC_URL=http://localhost:8080, HTTP_PORT=8080
docker compose up -d --build
```

- Shop: http://localhost:8080 — demo customer `alex@example.com`, demo sellers `kiln@example.com`,
  `northfield@example.com`, `lumen@example.com` (password `SEED_DEMO_PASSWORD`, default `Demo1234`)
- Admin: http://localhost:8080/admin — `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD`
- API docs (Swagger UI): http://localhost:8080/api/docs — behind `DOCS_AUTH` when it's set
- Email inbox (Mailpit): http://localhost:8080/mailpit/ — `MAILPIT_UI_AUTH`

Payments and the courier are simulated: checkout with card or wallet opens a sandbox gateway page; in the Seller Hub,
a booked parcel shows buttons that stand in for Leopards' scans. Both send signed webhooks like the real services
would.

## Develop and test

```bash
# Backend (Python 3.13 via uv)
cd backend
uv sync
uv run pytest            # creates <db>_test next to DATABASE_URL in backend/.env and migrates it
uv run ruff check app tests

# Frontend
cd frontend
npm install
npm run dev              # http://localhost:3000, proxies /api to API_INTERNAL_URL (default http://localhost:8000)
npm run typecheck && npm run lint
npm run api:types        # regenerate src/lib/api/schema.d.ts from frontend/openapi.json
```

After changing the API, refresh the frontend's types:

```bash
cd backend && uv run python -c "import json; from app.main import app; print(json.dumps(app.openapi()))" > ../frontend/openapi.json
cd ../frontend && npm run api:types
```

## Deploy

```bash
deploy/deploy.sh root@<droplet-ip>
```

The first run installs Docker, opens port 80, writes a `.env` with generated secrets on the server and prints the
admin and Mailpit logins. Later runs copy the code and rebuild; data stays in Docker volumes.

## Rules worth knowing

- **Money** is integer paisa everywhere (`129900` = Rs 1,299). **IDs** are sent as strings.
- **Stock**: checkout locks the variants in id order. COD orders commit stock at once; online orders hold it for 15
  minutes (`reserved_until`), then commit on payment or release on failure or expiry. `reserved ≤ on_hand` is a
  database check.
- **Idempotency**: checkout and payouts take an `Idempotency-Key`; a repeat returns the first result.
- **Jobs** are queued in the same transaction as the change that caused them, and every job checks current state
  first, so retries never double a refund, booking or ledger entry. Failed jobs wait in Admin → Background jobs.
- **Audit**: every change records who did it — user, admin or system — in `audit_log`.
