# Spice Garden

A modular-monolith restaurant platform for the Indian market, built with Next.js 15 App Router, TypeScript, PostgreSQL, Prisma, Auth.js, Razorpay, Zod and Vitest.

## What's in the repository

- **Customer storefront:** responsive menu, branch selection, item variants and add-ons, basket, server-priced quote, delivery/takeaway/dine-in checkout, Razorpay Checkout handoff, COD OTP verification and order tracking.
- **Reservations:** live slot availability, party-size filtering, transactional table-slot locks, confirmation code and cancellation.
- **Staff operations:** protected kitchen order queue, order-state transitions, live Server-Sent Events, admin summary, menu availability controls and reservation management.
- **Backend:** feature modules for auth, menu, pricing, orders, reservations, payments, notifications and admin. API routes are thin dispatchers; business logic stays in modules.
- **Security:** Auth.js HTTP-only session cookies, database-backed rate limits, Zod validation, origin checks, role guards, sanitized free-text inputs, server-side price calculation, Razorpay HMAC verification and webhook event de-duplication.
- **Data:** PostgreSQL + Prisma schema and initial migration. All money is integer paise.

## Local setup (Windows PowerShell)

Prerequisites: Node.js 20+, npm and Docker Desktop.

```powershell
cd C:\Users\kumar\Downloads\My_Resturent_fullstack_project-copy
Copy-Item .env.example .env.local
npm ci
npm run db:up
npx prisma migrate deploy
npm run db:seed
npm run dev
```

Open http://localhost:3000. The dev seed creates a demo branch, sample menu, two dining tables, a delivery zone and an admin account. Configure `SEED_ADMIN_EMAIL` and `SEED_ADMIN_PASSWORD` in `.env.local` before seeding. OTPs are printed in the server terminal while `OTP_PROVIDER=console`.

For a fresh local database, use `npx prisma migrate dev` instead of `npx prisma migrate deploy` if you intend to create new migrations.

## Environment configuration

See [`.env.example`](.env.example). Required: `DATABASE_URL`, `AUTH_SECRET` (32+ random characters recommended), and `NEXT_PUBLIC_APP_URL`. For hosted Postgres also set `DIRECT_URL`. Google sign-in, SMS/email delivery and Razorpay are optional in local development but require real provider credentials in production.

**Never commit `.env.local`, provider credentials, real customer data or production secrets.** Use Razorpay test keys until the full payment and refund lifecycle has been tested.

## Commands

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js development server |
| `npm run build` | Generate Prisma client and build production app |
| `npm start` | Start production server |
| `npm run typecheck` | TypeScript validation |
| `npm test` | Run Vitest unit tests |
| `npm run db:up` / `db:down` | Start / stop local PostgreSQL |
| `npm run db:deploy` | Apply committed migrations |
| `npm run db:seed` | Seed demo restaurant and staff account |
| `npm run db:studio` | Open Prisma Studio |

## Main routes

| Route | Purpose |
|---|---|
| `/` | Customer menu and checkout |
| `/login` | Customer mobile OTP login |
| `/reserve` | Table reservation |
| `/track/[id]` | Order status and timeline |
| `/staff-login` | Staff email/password login |
| `/kitchen` | Kitchen display |
| `/admin` | Admin dashboard |

## API overview

- `GET /api/branches`, `GET /api/menu?branch=<slug>`
- `POST /api/pricing/quote`, `POST /api/checkout`
- `GET /api/orders`, `GET /api/orders/:id`, `GET /api/orders/:id/stream`
- `POST /api/otp/send`, Auth.js handlers at `/api/auth/*`
- `POST /api/reservations`, `GET /api/reservations/availability`, `POST /api/reservations/cancel`
- `POST /api/payments/razorpay/order`, `POST /api/payments/razorpay/verify`, `POST /api/payments/razorpay/webhook`
- `POST /api/payments/cod/send`, `POST /api/payments/cod/verify`
- Staff/admin endpoints under `/api/staff/*`, protected by role guards.

## Architecture and operations

- [System architecture](docs/ARCHITECTURE.md)
- [Deployment checklist](docs/DEPLOYMENT.md)
- [Prisma schema](prisma/schema.prisma)

## Important production work before launch

1. Replace demo restaurant address, phone, FSSAI/GSTIN placeholders, PIN-code zones, menu and prices with verified business data.
2. Set a strong admin password and rotate it after first login.
3. Configure a production SMS/OTP provider and email provider; console delivery is development-only.
4. Configure Razorpay keys and webhook secret; test payment capture, failed payments, duplicate webhooks, refunds and refund reconciliation.
5. Confirm GST treatment, invoice format, packaging/delivery taxability, cancellation/refund terms and food-allergen disclosures with the restaurant's CA/legal advisors.
6. The in-process SSE bus and database rate limiter are single-deployment starter implementations. Use shared Redis or Postgres pub/sub before horizontal scaling.
7. Run CI and a full staging acceptance test with real PostgreSQL before production.

## Delivery status

The repository now contains the initial customer experience, API wiring, reservation and admin endpoints, staff screens, demo seed, unit tests, CI workflow and deployment notes. External provider credentials, verified restaurant data, production deployment and staging acceptance remain environment/business-owner tasks. CI is the source of truth for typecheck/build status; do not treat a pushed commit as a successful production build until its workflow passes.
