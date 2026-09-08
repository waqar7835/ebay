# eBay Order Management

Multi-tenant order/revenue-share management platform. Monorepo (pnpm workspaces + Turborepo) with three apps sharing one PostgreSQL database.

```
apps/
  backend/     NestJS + Sequelize — REST API, JWT auth, billing engine, Swagger docs (http://localhost:4000, docs at /docs)
  backoffice/  Next.js — Admin/Staff panel: users, products, orders, invoices, seat billing (http://localhost:3001)
  frontend/    Next.js — Partner portal for Account Holders/Stock Owners/3PLs/Staff (http://localhost:3000)
packages/
  shared/      Shared TypeScript types/DTOs/enums used by all three apps
```

## Domain summary

- **Companies** self-register (name/email/password/logo) and verify their email via a 30-minute token link before logging in.
- **Roles**: `ADMIN` (the registrant, exactly one per company), `STAFF` (permission-gated), `ACCOUNT_HOLDER`, `STOCK_OWNER`, `THREE_PL` — a user can hold several roles at once. A platform-wide `SUPER_ADMIN` (seeded, not self-registered) sees and manages every company.
- **Products** carry three prices (`stockOwnerCost`, `buyPrice`, `sellPrice`) and a fulfillment type (`STOCK`, tied to a specific 3PL warehouse, or `DROPSHIP`, no 3PL).
- **Orders** are one product each; all revenue-share inputs (prices, rates, 3PL fees) are snapshotted onto the order at creation so later rate changes never rewrite history.
- **Revenue share**: Stock Owner profit-share or fixed payout, Account Holder % of their order profit, 3PL flat fee per order, optional Staff % of total company profit — see `apps/backend/src/finance/finance.service.ts` for the exact formulas.
- **Invoices** are generated per user per role for a completed billing cycle (each role/company has its own cycle anchor day), itemized, with an UNPAID → PAID toggle and refund clawback handling.
- **Seat billing**: Account Holder/Stock Owner/3PL seats are paid (Admin/Staff seats are free); the first seat of each type per company gets one free month. Payment is manual/offline — Admin submits a seat-payment order with a receipt, the Super Admin approves/rejects it. Unpaid seats get reminder emails at day 5/10 and are blocked at day 15 (see `apps/backend/src/billing/`).

Full detail and every confirmed business rule is in the build plan at `.claude/plans/resilient-noodling-stream.md` (or ask to see it).

## Prerequisites

- Node.js 20+
- pnpm 9+ (`corepack enable` will pick up the pinned version)
- Docker (for local Postgres)

## Setup

```bash
pnpm install

# start Postgres
pnpm db:up

# configure env vars
cp apps/backend/.env.example apps/backend/.env
cp apps/frontend/.env.example apps/frontend/.env.local
cp apps/backoffice/.env.example apps/backoffice/.env.local

# apply schema and seed demo data:
#  - a Super Admin (superadmin@example.com)
#  - a demo company with one Admin, Account Holder, Stock Owner, and 3PL
#    (all logins: password "changeme123")
cd apps/backend
pnpm db:migrate
pnpm db:seed
cd ../..

# run everything
pnpm dev
```

- Frontend (partner portal): http://localhost:3000
- Backoffice (admin/staff): http://localhost:3001
- Backend API + Swagger: http://localhost:4000/docs

Since SMTP isn't configured by default, verification/invite/reminder emails are logged to the backend console instead of actually sent (`apps/backend/src/mailer/mailer.service.ts`) — copy the link out of the log when testing registration or invite flows.

### Seeded login credentials

`pnpm db:seed` creates these accounts. Password for all of them is **`changeme123`**.

| Email | Role | Log in at |
|---|---|---|
| `superadmin@example.com` | Super Admin (platform-wide, all companies) | Backoffice |
| `admin@example.com` | Admin — "Demo Company" | Backoffice |
| `accountholder@example.com` | Account Holder — "Demo Company" (20% share, $5 3PL price) | Partner portal |
| `stockowner@example.com` | Stock Owner — "Demo Company" (40% profit-share mode) | Partner portal |
| `threepl@example.com` | 3PL — "Demo Company" ($3 payout/order) | Partner portal |

A demo product (`DEMO-SKU-1`, buy $200 / sell $250, cost $100) is seeded for the Stock Owner, assigned to the 3PL above.

## First real end-to-end walkthrough (once Postgres is up)

1. Register a new company at the backoffice `/register` page, grab the verification link from the backend console log, visit it, then log in.
2. From **Users**, invite an Account Holder, a Stock Owner, and a 3PL (each gets a free first month automatically). Grab each invite link from the console log to set their password.
3. From **Products**, add a product for the Stock Owner (STOCK type needs the 3PL assigned).
4. From **Orders**, create an order for that product against the Account Holder.
5. Log into the frontend portal as each invited user to see their dashboard; advance the order's status as the 3PL.
6. Mark the order `DELIVERED`, then (once a billing cycle has completed) generate an invoice from either app.

## Notes

- All models live in `apps/backend/src/database/models` (`sequelize-typescript`). Schema changes go through a new migration in `apps/backend/database/migrations` (`pnpm --filter backend exec sequelize-cli migration:generate --name <name>`), run via `pnpm db:migrate`.
- `packages/shared` is the single source of truth for cross-app types/enums — keep frontend, backoffice, and backend in sync through it rather than duplicating shapes.
- File uploads (company logo, product images, payment receipts) are stored on local disk under `apps/backend/uploads/` and served at `/uploads/...`; swap for S3-compatible storage before any real deployment.
