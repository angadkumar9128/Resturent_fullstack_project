# Spice Garden – System Architecture

## 1. Style: Modular Monolith, Clean Architecture

One deployable Next.js app (App Router, TypeScript). Business logic lives in
**feature modules**, never in route files or React components.

```
HTTP request
  → Route Handler (src/app/api/**/route.ts)      thin: parse → call controller → return
  → Controller   (modules/<x>/<x>.controller.ts) Zod-validates input, checks RBAC, maps errors
  → Service      (modules/<x>/<x>.service.ts)    business rules, transactions, pure logic
  → Repository   (modules/<x>/<x>.repository.ts) the ONLY layer that touches Prisma
  → PostgreSQL
```

Rules (enforced in code review):
1. A route file is ≤ 20 lines.
2. Services never import `next/*` or `Request/Response`. They are unit-testable.
3. Only repositories import `@prisma/client` queries. Services receive a repository (or a transaction client) by argument.
4. Modules talk to each other only through another module's `index.ts` public API.
5. Money is integer paise everywhere; formatting to ₹ happens only in the UI.
6. The pricing engine is a **pure function** (no DB access) so GST/discount logic is exhaustively testable (Phase 6).

## 2. Folder structure

```
/
├─ prisma/
│  ├─ schema.prisma            database schema (Phase 1)
│  ├─ migrations/              generated
│  └─ seed.ts                  branch, tables, menu, admin, coupons (Phase 2)
├─ src/
│  ├─ app/                     Next.js routes ONLY (UI + thin API handlers)
│  │  ├─ (customer)/           landing, menu, cart, checkout, track, reserve
│  │  ├─ (admin)/admin/        admin panel
│  │  ├─ (kitchen)/kitchen/    KDS
│  │  └─ api/                  route handlers → controllers
│  ├─ modules/
│  │  ├─ auth/                 OTP, credentials, Google, session, RBAC guards
│  │  ├─ menu/                 catalog, availability, search
│  │  ├─ pricing/              cart pricing + GST + coupons (pure engine)
│  │  ├─ orders/               create order, status machine, KDS feed
│  │  ├─ reservations/         slots, booking transaction, confirmations
│  │  ├─ payments/             Razorpay order, signature verify, webhooks, COD OTP
│  │  ├─ notifications/        SMS / WhatsApp / email adapters
│  │  └─ admin/                CRUD, reports (GST, revenue), coupons
│  ├─ shared/
│  │  ├─ db/                   prisma client singleton, transaction helper
│  │  ├─ errors/               AppError hierarchy + global error handler
│  │  ├─ http/                 route wrapper (try/catch, rate limit, JSON shape)
│  │  ├─ security/             rate limiter, sanitize, CSRF/origin check, headers
│  │  ├─ events/               in-process event bus → SSE
│  │  ├─ config/               validated env (Zod)
│  │  └─ utils/                money, dates (Asia/Kolkata), ids
│  ├─ components/              ui/ (shadcn), layout/, menu/, cart/, admin/, kitchen/
│  ├─ stores/                  Zustand (cart, ui)
│  ├─ hooks/                   React Query hooks
│  ├─ lib/                     client helpers (fetcher, cn)
│  └─ middleware.ts            route protection by role
├─ tests/                      unit + integration (Vitest)
├─ docs/
└─ _legacy_v1/                 archived first prototype (safe to delete)
```

## 3. Key design decisions

### Authentication
- **Auth.js v5**, JWT session strategy → session lives in an **HTTP-only, SameSite=Lax, Secure** cookie.
- Providers: Google, Credentials (email + password, for staff/admin), Credentials (phone + OTP, for customers).
- OTP: 6 digits, stored **hashed** in `OtpChallenge`, 5-minute expiry, max 5 attempts, rate-limited per phone and per IP. Sent through an adapter (`console` in dev, MSG91 or Twilio in prod).
- Role is read from the DB into the JWT; `middleware.ts` plus per-controller guards enforce RBAC (`CUSTOMER`, `KITCHEN_STAFF`, `ADMIN`).
- Guests may order without an account (phone-verified via COD OTP or Razorpay payment).

### Pricing & Indian tax (server is the single source of truth)
Client sends only `{ itemId, variantId, addonIds[], qty, instructions }`. The server re-reads prices and computes:

```
subtotal   = Σ (variantPrice + Σ addonPrice) × qty
discount   = coupon(subtotal)               FLAT | PERCENT (capped), min-order check
taxable    = subtotal − discount
GST        = taxable × branch.gstRate (default 5%)  → CGST = SGST = GST / 2
packaging  = branch.packagingCharge (delivery/takeaway)
delivery   = zone fee by PIN code, free above threshold
total      = round( taxable + GST + packaging + delivery )   (round-off stored separately)
```
Rounding rule: GST is computed on the whole taxable amount, then split; if the paise are odd, CGST gets the floor and SGST the remainder so `CGST + SGST == GST` exactly.
*Packaging and delivery are treated as non-taxable in v1 (configurable flag in Phase 2 if your CA says otherwise).*

### Payments (Phase 3)
1. Server creates `Order(PENDING_PAYMENT)` + Razorpay order using the **server-computed** amount.
2. Client pays via Razorpay Checkout (UPI intent/collect, cards, netbanking).
3. Client posts `{razorpay_order_id, razorpay_payment_id, razorpay_signature}` → server verifies `HMAC_SHA256(order_id|payment_id, secret)` using a constant-time compare.
4. Webhook (`payment.captured`, `payment.failed`, `refund.processed`) verified with the webhook secret and recorded in `WebhookEvent (provider, eventId) UNIQUE` → duplicate deliveries are no-ops. Order moves to `PLACED` inside one transaction.
5. COD: order created as `PLACED` only after OTP verification of the phone number.

### Concurrency
| Risk | Guard |
|---|---|
| Two people book the same table/slot | `ReservationSlotLock @@unique([tableId, slotStart])` + `prisma.$transaction`; loser gets a clean "slot just taken" error |
| Coupon with limited uses over-redeemed | Inside a transaction: `SELECT … FOR UPDATE` on the coupon row, check `usedCount < usageLimit`, increment; `CouponRedemption.orderId UNIQUE` makes retries idempotent |
| Duplicate payment webhook | `WebhookEvent` unique key + `Payment.providerPaymentId` unique |
| Stock oversell | Conditional `UPDATE … SET stockQty = stockQty - n WHERE stockQty >= n` inside the order transaction |

### Real-time (KDS and order tracker)
**Server-Sent Events** (`/api/kitchen/stream`, `/api/orders/:id/stream`). An in-process event bus publishes on status change. This is correct for one server instance; for multiple instances, swap the bus for Postgres `LISTEN/NOTIFY` (interface stays the same). SSE works over plain HTTP and survives mobile networks better than WebSockets for one-way updates.

### Security layers
- **Validation:** Zod schemas shared by client and server (`modules/*/**.schema.ts`).
- **Headers:** CSP, HSTS, X-Frame-Options, Referrer-Policy, Permissions-Policy set in `next.config` (Helmet-equivalent for Next.js).
- **CSRF:** SameSite=Lax cookies + strict `Origin`/`Host` check on every state-changing API request + Auth.js CSRF token on auth routes.
- **XSS:** React escapes by default; free-text fields (notes, instructions) are sanitized server-side with `sanitize-html` before storage.
- **Rate limiting:** OTP send/verify, login, order creation, coupon validation (`RateLimitBucket`, swappable for Redis).
- **Errors:** every route is wrapped by `withApi()`; errors become `{ error: { code, message, details? }, requestId }`. Stack traces never leave the server.
- **Audit:** admin mutations write `AuditLog`.
- **Secrets:** only in `.env.local` / host secret store; validated at boot by `shared/config/env.ts`.

### Frontend
- Server Components + ISR (`revalidate = 60`) for menu pages; `revalidateTag('menu')` on admin edits.
- TanStack Query for server state; Zustand (persisted) for cart and UI.
- `error.tsx` boundaries per route segment + component-level `ErrorBoundary` around widgets (cart, tracker, KDS cards).
- Mobile-first: sticky bottom nav, quick-add buttons, bottom-sheet item customizer, one-tap UPI at checkout.
- SEO: `generateMetadata`, JSON-LD `Restaurant` + `Menu` schema, `next/image`.

## 4. Order state machine

```
PENDING_PAYMENT → PLACED → ACCEPTED → PREPARING → READY → (DELIVERY) OUT_FOR_DELIVERY → DELIVERED
                                                      └──→ (TAKEAWAY / DINE_IN) COMPLETED
Any non-final state → CANCELLED (rules by role and by state)
```
Transitions are validated in `orders.service` (a lookup table), recorded in `OrderStatusEvent`, and broadcast over SSE.

## 5. Phase roadmap
| Phase | Deliverable |
|---|---|
| 1 | Architecture, folder structure, Prisma schema (this document) |
| 2 | Env config, error system, auth + RBAC, Zod schemas, menu + pricing engine + reservations services, seed |
| 3 | Razorpay integration + webhook handler + COD OTP |
| 4 | Customer frontend |
| 5 | Admin panel + KDS |
| 6 | Tests for GST/cart/coupons + deployment checklist |
