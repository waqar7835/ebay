# eBay Order Management — CLAUDE.md

Multi-tenant order/revenue-share management platform for eBay-style reselling operations. Solo project, pre-launch (no real users yet). Monorepo: pnpm workspaces + Turborepo, one PostgreSQL database shared by three apps.

```
apps/
  backend/     NestJS + Sequelize (sequelize-typescript) — REST API, JWT auth, billing engine, Swagger at /docs
  backoffice/  Next.js 14 (App Router) — Admin/Staff panel (localhost:3001)
  frontend/    Next.js 14 (App Router) — Partner portal for company users (localhost:3000)
packages/
  shared/      TS-types-only package (enums/DTOs). No runtime logic, no shared UI, no shared API client.
```

Full setup/run instructions are in `README.md` — treat the README's setup steps as reliable, but **treat its prose descriptions of features as possibly stale**; verify against code before trusting a claim about what exists. (Known stale spots as of 2026-09-18: it describes a backoffice `/register` flow that doesn't exist yet — see Known Limitations below — and undersells the upload story by saying to "swap for S3-compatible storage before real deployment," when Cloudflare R2 support is already implemented in `apps/backend/src/uploads/uploads.util.ts`.)

The original build plan (`.claude/plans/...`) that the README references **no longer exists in Claude's plan storage** — this file plus memory is now the authoritative source of "why," since that plan can't be recovered.

## Domain model & business rules

- **Companies** self-register (name/email/password/logo), verify email via a 30-minute token or 6-digit code, then log in. `Company.billingAnchorDay` sets their billing cycle start; `Company.staleOrderDays` (default 3) flags orders that have sat too long in an open status — see Known Limitations, it's currently unconfigurable.
- **Roles**: `SUPER_ADMIN`, `PLATFORM_STAFF` (platform-wide, backoffice-only — see Auth Realm Split below), `ADMIN` (company registrant, exactly one per company), `STAFF` (per-company, permission-gated via `staff_profiles`), `ACCOUNT_HOLDER`, `STOCK_OWNER`, `THREE_PL`. A person can hold multiple roles, and — since the multi-account change (commit `18509bf`) — **the same email can have a separate account+password per role**, not one shared login across roles.
- **Products**: `stockOwnerCost` / `buyPrice` / `sellPrice`, plus a fulfillment type: `STOCK` (tied to one 3PL warehouse) or `DROPSHIP` (no 3PL).
- **Orders**: one product each. All revenue-share inputs (prices, share percentages, 3PL fees) are **snapshotted onto the order at creation** (`*Snapshot` fields on the `Order` model) so later rate changes never rewrite history. See `apps/backend/src/finance/finance.service.ts` — it's a pure function over an order's snapshot, never re-reads live rates.
- **Revenue share** (exact formulas in `finance.service.ts`):
  - Stock Owner: gross = `buyPrice × qty`; if `PROFIT_SHARE` mode, the company cuts `sharePercent% × (buyPrice − stockOwnerCost) × qty` off that gross; if `FIXED` mode, no cut.
  - Account Holder: profit = `ebayNetProceeds − shippingCost − (sellPrice × qty) − threePlPriceCharged`; payout = `profit × sharePercent%`; the remainder stays with the company.
  - 3PL: flat `payoutPerOrder`, snapshotted at order creation; company markup = `threePlPriceCharged − threePlPayout`.
  - Staff (optional): `sharePercent% × total company profit` (all four sources summed — see `companyProfit()`).
  - All money math rounds to 2 decimals via a local `round2()` helper (duplicated in `finance.service.ts`, `invoices.service.ts`, `dashboard.service.ts`, `billing.service.ts` — not centralized).
- **Invoices**: generated per user per role for the last *completed* billing cycle (`invoices/billing-cycle.util.ts`), itemized into `InvoiceLineItem` rows, `UNPAID → PAID` toggle. Refunded orders that were already invoiced get an automatic negative clawback line on the next generation (`buildClawbacks()`), not on the original invoice.
- **Seat billing**: Account Holder/Stock Owner/3PL seats are paid (Admin/Staff are free); first seat of each type per company gets one free month (`grantFreeSeatIfAvailable`, tracked per-company via `freeAccountHolderUsed`/`freeStockOwnerUsed`/`freeThreePlUsed` flags — each independent). Payment is manual/offline: company submits a seat-payment order with a receipt upload, Super Admin approves/rejects (`PLATFORM_STAFF` deliberately excluded from this approval — financial action). A daily cron (`billing.scheduler.ts`, 9am) sends reminders at day 5/10 overdue and blocks the seat at day 15, unless a payment order is already `SUBMITTED` (grace period).

## Auth realm split — read before touching auth/roles/permissions

**This is the single most load-bearing architectural fact in the codebase.** Two fully separate identity tables, not one shared `users` table with role checks:

- **`backoffice_users`**: `SUPER_ADMIN` / `PLATFORM_STAFF` only. No `companyId` — platform-wide. `PLATFORM_STAFF` is invite-only, created by `SUPER_ADMIN`, with permission flags in `backoffice_staff_profiles`. Logs in only via the backoffice app, sending `context: "backoffice"` on login.
- **`users`** (portal): `ADMIN` / `STAFF` / `ACCOUNT_HOLDER` / `STOCK_OWNER` / `THREE_PL`. `ADMIN` self-registers via frontend `/register`. `STAFF` is invited per-company by that company's own `ADMIN`, permission-gated to their own company (`staff_profiles`). Logs in only via the frontend app (no `context` sent — defaults to portal).
- **Same email can independently exist in both tables** with separate passwords — unrelated identities, not linked. This extends to *within* the portal table too: one email can hold a separate account per role.
- **The JWT `realm: "backoffice" | "portal"` claim is what every guard branches on** — not the `roles` array. See `apps/backend/src/common/company-scope.util.ts` (`resolveCompanyId`) and `apps/backend/src/common/guards/permissions.guard.ts`. Backoffice-realm requests must pass `?companyId=` to act on a company; portal-realm requests are always auto-pinned to their own company from the JWT.
- **Client-side enforcement is by hardcoded call shape, not shared middleware**: backoffice's `login()` always sends `context: "backoffice"`; frontend's never does. Both apps' `lib/api.ts` independently implement `withSelectedCompany()` to append `?companyId=` only when the logged-in user is `SUPER_ADMIN`/`PLATFORM_STAFF` with a company selected via the Nav dropdown.
- Backoffice keeps every original screen (Products/Orders/Users/Invoices/Billing) for Super Admin/Platform Staff cross-company oversight, permission-gated the same way company `STAFF` always was. Frontend has its own near-verbatim copies (minus company-selector logic) for company self-service.

Full memory note: `[[auth-realm-split]]`.

## Commands

```bash
pnpm install
pnpm db:up                    # Postgres via docker-compose
pnpm --filter backend db:migrate
pnpm --filter backend db:seed
pnpm dev                      # all three apps via turbo
```

New migration: `pnpm --filter backend exec sequelize-cli migration:generate --name <name>`, then `pnpm db:migrate`. Models live in `apps/backend/src/database/models` (`sequelize-typescript`).

No test suite exists yet (`jest` is configured in `apps/backend/package.json` but unused, and there are zero `.spec.ts`/`.test.ts` files repo-wide) — this is an accepted trade-off for now while moving fast pre-launch, not a bug to silently fix.

## Conventions

- `packages/shared` is types/enums/DTOs **only** — no shared runtime logic, no shared API client, no shared UI components. `apps/frontend/lib/api.ts` and `apps/backoffice/lib/api.ts` independently reimplement the same `request()`/`authHeaders()`/`getToken()`/`withSelectedCompany()` pattern, and `ImageCropModal.tsx`/`Nav.tsx` exist independently in both apps' `components/`. **This duplication is intentional** — the two apps are kept decoupled on purpose. Don't "fix" it by introducing cross-app coupling unless asked.
- Both Next.js apps have **no `middleware.ts` and no centralized route guard** — every protected page independently does a client-side `useEffect` redirect-if-no-token check. See Known Limitations — this one *is* wanted as a real fix, just not done yet.
- Order financial fields are always snapshotted at creation (`*Snapshot` suffix) — never join back to live `Product`/`*Profile` rates to compute historical financials.
- File uploads (company logo, product images, payment receipts, shipping labels) go through `apps/backend/src/uploads/uploads.util.ts`, which transparently switches between local disk (`UPLOADS_DIR`) and Cloudflare R2 based on whether `R2_ACCOUNT_ID` is set.

## Working agreement

If a new task conflicts with something documented here or in memory (an architecture fact like the realm split, a business-rule fact like a revenue-share formula or the snapshot-on-order pattern, or an item in Known Limitations marked intentional) — **stop and flag it** rather than silently complying with the new request or silently defaulting to what's documented. State what's documented, state how the request differs, and ask the user to confirm which way to resolve it before proceeding. Once confirmed, update this file and/or the relevant memory so it doesn't go stale.

## Known limitations / TODOs

Confirmed by reading the code, prioritized per your direction (2026-09-18):

1. **No centralized auth route guard in either Next.js app** (real TODO) — every page duplicates its own `useEffect` redirect check; no `middleware.ts`. Worth building a shared pattern (even if not shared code, given the decoupling convention above — maybe a shared *hook* per app).
2. **`Company.staleOrderDays` has no update endpoint or UI** (real TODO) — read everywhere (dashboard aging-order flags, order-list staleness) but permanently stuck at the DB default of `3`. `billingAnchorDay` has a working `/companies/me/billing-anchor-day` endpoint + UI; `staleOrderDays` needs the equivalent.
3. **Backoffice `/register` flow doesn't exist** (real TODO) — README describes Super Admin registering a company on a client's behalf from backoffice; no such page or API call exists in `apps/backoffice`. Only `POST /auth/register` (used by frontend's self-service `/register`) exists backend-side; backoffice would need its own page calling the same endpoint.
4. **No post-invite edit UI for Account Holder / Stock Owner profiles** (confirmed real gap, not yet prioritized) — backend has working `PATCH :id/account-holder-profile` and `PATCH :id/stock-owner-profile` endpoints, but neither app calls them outside the initial invite DTO. 3PL has a dedicated `/users/[id]/edit-three-pl` page in frontend; Account Holder/Stock Owner have no equivalent in either app. Once invited, their share%/payout terms are stuck unless edited directly in the DB.
5. **No automated tests** — accepted trade-off for now, not a priority while solo/pre-launch.
6. **`PaginatedResult<T>`** (in `packages/shared`) is unused dead code — intentionally left in place as a placeholder for future pagination work, not worth removing.
7. Backoffice and frontend use different UX patterns for the same create/edit operations (backoffice: inline toggle-forms on list pages; frontend: dedicated routes like `/orders/new`) — functional but inconsistent; not flagged as a priority, just noted so it isn't mistaken for a bug.
