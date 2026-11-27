# Spice Garden – Restaurant Full-Stack App

Online ordering, table reservations, order tracking and an admin dashboard.

**Stack:** Node.js + Express (REST API, JWT auth) · JSON file storage (`data/db.json`) · Vanilla HTML/CSS/JS frontend.

## Run it

```powershell
cd C:\Users\kumar\Downloads\My_Resturent_fullstack_project
npm install
npm start
```

- Website: http://localhost:3000
- Admin:   http://localhost:3000/admin.html  (default login: `admin` / `admin123`)

`data/db.json` is created with sample menu items on first run. Delete it to reset.

## Configuration (environment variables)

| Variable         | Purpose                                   | Default                          |
|------------------|-------------------------------------------|----------------------------------|
| `PORT`           | Server port                               | `3000`                           |
| `JWT_SECRET`     | Secret used to sign admin tokens          | `change-this-secret-in-production` |
| `ADMIN_PASSWORD` | Admin password (used only when db is first created) | `admin123`         |

PowerShell example:
```powershell
$env:JWT_SECRET="my-long-random-secret"; $env:ADMIN_PASSWORD="StrongPass!"; npm start
```

## Features

**Customers**
- Browse menu by category, veg / non-veg indicators
- Cart (saved in browser), checkout with delivery details
- Table reservations with date/time/guest validation
- Order tracking by order number

**Admin**
- Login (JWT, 8h session)
- Dashboard stats: orders, pending, revenue, today's reservations
- Update order and reservation statuses
- Add / edit / delete / hide menu items

## API summary

| Method | Route                          | Auth  |
|--------|--------------------------------|-------|
| GET    | `/api/menu`                    | –     |
| POST   | `/api/orders`                  | –     |
| GET    | `/api/orders/:id`              | –     |
| POST   | `/api/reservations`            | –     |
| POST   | `/api/auth/login`              | –     |
| GET    | `/api/admin/stats`             | admin |
| GET/PATCH | `/api/admin/orders[/:id]`   | admin |
| GET/PATCH | `/api/admin/reservations[/:id]` | admin |
| GET/POST/PUT/DELETE | `/api/admin/menu[/:id]` | admin |

Order prices are always recalculated on the server.

## Project structure

```
server.js        Express app and API routes
db.js            JSON-file data store + seed data
public/          Frontend (index.html, admin.html, css/, js/)
data/db.json     Created automatically on first run
```

## Ideas for next steps
- Swap `db.js` for SQLite/MongoDB/PostgreSQL
- Online payments (Razorpay / Stripe)
- Menu images, order email/SMS notifications
- Rate limiting and HTTPS before deploying publicly
