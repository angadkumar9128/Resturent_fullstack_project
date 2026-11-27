# Spice Garden

Full-stack restaurant platform for the Indian market: online ordering, QR dine-in, table reservations, Razorpay payments, kitchen display and admin analytics.

**Stack:** Next.js 15 (App Router) · TypeScript · Tailwind + shadcn/ui · TanStack Query · Zustand · PostgreSQL + Prisma · Auth.js · Razorpay · Zod · Vitest

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) for the design and [`prisma/schema.prisma`](prisma/schema.prisma) for the data model.

## Status

| Phase | Status |
|---|---|
| 1 – Architecture & Prisma schema | Done (awaiting review) |
| 2 – Backend core | Pending |
| 3 – Razorpay | Pending |
| 4 – Customer frontend | Pending |
| 5 – Admin & KDS | Pending |
| 6 – Tests & deployment | Pending |

## Prerequisites
- Node.js 20+
- Docker Desktop (for local PostgreSQL) **or** a hosted Postgres URL (Neon / Supabase)

## Setup (after Phase 1 review)
```powershell
cd C:\Users\kumar\Downloads\My_Resturent_fullstack_project
copy .env.example .env.local      # then edit .env.local
npm install
npm run db:up                     # starts Postgres in Docker
npx prisma migrate dev --name init
```

The first prototype is archived in `_legacy_v1/` and can be deleted.
