# AS LINE Ledger

A small billing/inventory app for a single business: Parties (customers &
suppliers), Items with stock tracking, Sale and Purchase invoicing,
Expenses, reports with CSV export, and multi-user accounts with admin/staff
roles.

## Modules

- **Parties** — customers/suppliers, with a running balance (opening balance
  plus unpaid sales/purchases). Positive = they owe you, negative = you owe
  them.
- **Items** — name, unit, sale/purchase price, opening stock, optional
  low-stock alert threshold. Current stock is always computed from
  opening stock + purchases − sales, never stored, so it can't drift.
- **Sale / Purchase** — multi-line invoices against an item catalog, with a
  party, amount paid, and payment method (cash/bank). Unpaid amounts feed
  each party's balance.
- **Expenses** — a simple categorized expense log (income is tracked via
  Sale, not here).
- **Reports** — expense totals and category breakdown for a date range,
  with CSV export.
- **Dashboard** — this month's sale/expense/purchase totals, a sale trend
  chart, You'll Receive/Pay, stock value & low-stock items, and a cash/bank
  summary.

## Getting started (local)

```bash
npm install
npm run db:push   # creates prisma/dev.db from prisma/schema.prisma
npm run db:seed   # adds a starter set of expense categories
npm run dev
```

Open http://localhost:3000 — the first visit prompts you to create the admin
account. From there, add some Parties/Items, then record Sales/Purchases;
the admin can also create staff accounts (Users page).

## Deploying to Vercel

1. In Vercel, **Add New → Project** and import this GitHub repo.
2. **Storage → Create Database → Neon (Postgres)** and connect it to the
   project (this provides `DATABASE_URL` and `DATABASE_URL_UNPOOLED`;
   `DIRECT_URL` is filled in from the latter automatically).
3. Add the remaining environment variables from `.env.example`
   (`SESSION_SECRET`, `NEXT_PUBLIC_CURRENCY`, `COOKIE_SECURE=true`,
   `APP_URL`, and optionally `SMTP_*`).
4. Deploy. The build (`vercel.json`) applies database migrations and the
   default categories automatically. The first visit asks you to create the
   Super Admin account.

## Running in Docker

```bash
docker compose up -d --build
```

Open http://localhost:3000. The database lives in a named Docker volume
(`ledger-data`), so your data survives `docker compose restart` / `down`
and rebuilds — it's only lost if you explicitly remove the volume
(`docker compose down -v`).

Before using this beyond your own machine, change `SESSION_SECRET` in
`docker-compose.yml` to a long random string (e.g. `openssl rand -hex 32`).

Useful commands:

```bash
docker compose logs -f      # tail app logs
docker compose down         # stop (keeps data)
docker compose down -v      # stop and delete all data
```

## Configuration

Set these in `.env`:

- `DATABASE_URL` — SQLite by default (`file:./dev.db`). See "Moving to a
  hosted database" below to switch to Postgres for production.
- `SESSION_SECRET` — random string used to sign login sessions. Change this
  before deploying anywhere real.
- `NEXT_PUBLIC_CURRENCY` — an ISO currency code (defaults to `INR`). This is
  a client-bundle constant: changing it requires a rebuild
  (`npm run build`, or `docker compose build`/`up --build` — the Dockerfile
  and `docker-compose.yml` both pass it as a build arg for exactly this
  reason, so update both if you change it).
- `COOKIE_SECURE` — set to `true` only once the app is actually served over
  HTTPS (e.g. behind a reverse proxy, or on Vercel). Leave unset for local
  use or the Docker setup here, which are plain HTTP — a `Secure` cookie on
  an HTTP origin won't be stored by the browser, which breaks login.
- `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` — needed
  for the "Forgot password?" email link on the login page. Without
  `SMTP_HOST` set, the reset link is logged to the server console instead of
  emailed — fine for local testing, not for real use.

## Roles

- **Admin**: everything staff can do, plus managing expense categories and
  user accounts.
- **Staff**: can record sales/purchases/expenses, manage parties/items, and
  view dashboard/reports. Can edit/delete only the sales/purchases/expenses
  they recorded; admins can edit/delete any of them.

## Moving to a hosted Postgres database

For a hosted deployment (e.g. Vercel), swap SQLite for Postgres (e.g. Neon,
Supabase, or Railway) — no application code changes needed:

1. In `prisma/schema.prisma`, change the datasource `provider` from
   `"sqlite"` to `"postgresql"`.
2. Set `DATABASE_URL` in your hosting provider's environment variables to
   the Postgres connection string.
3. Run `npx prisma db push` (or `prisma migrate deploy`) against that
   database, then `npm run db:seed` once to add starter categories.

## Notes

- Money is stored internally as integer cents to avoid floating-point
  rounding errors.
- Party/item balances and stock are always computed at read time from
  Sale/Purchase rows, not stored as mutable counters — so they can't drift
  out of sync even if a sale is edited or deleted later.
- Not included (kept out of scope for this build): GST/tax, PDF invoices,
  discounts, multi-currency, an online store, sync/backup, and per-invoice
  payment history (each sale/purchase has one "amount paid" figure, not a
  ledger of partial payments).
- The dev server currently logs a "middleware is deprecated, use proxy
  instead" warning from Next.js 16 — this is a naming migration Next.js
  introduced very recently; `middleware.ts` still works correctly, but at
  some point it'll be worth renaming to the `proxy` convention.
