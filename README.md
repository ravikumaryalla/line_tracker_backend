# Lending Collection App — Backend

Express + PostgreSQL API for the Lending Collection App. The app is admin-only: admins add customers, record collections, expenses and losses.

## Run

```
npm install
cp .env.example .env   # fill in DATABASE_URL with your Postgres connection string
npm start               # http://localhost:4000
```

Tables are created automatically on startup (`CREATE TABLE IF NOT EXISTS`). The database starts empty — there is no demo data.

### First-time admin bootstrap

Every endpoint except `/api/health` and `/api/auth/login` requires an admin's Bearer token, and there is no public signup — so the very first admin has to be created out-of-band. Set `BOOTSTRAP_ADMIN_PHONE` and `BOOTSTRAP_ADMIN_PASSWORD` in `.env` and start the server once; it inserts an approved admin with those credentials if that phone doesn't already exist (idempotent per phone — safe to leave running, or clear the vars after first boot; changing the vars to a new phone/password creates another admin on the next boot). Log in with that phone/password to get a token, then use `/api/users` to create more admins.

## API

- `POST /api/auth/login { phone, password }` — returns `{ token, user }` for an active admin account (other roles are refused).
- `GET  /api/auth/me` — the logged-in user's own record.
- `GET  /api/users` — list admin accounts.
- `POST /api/users { name, phone, password }` — create another admin.
- `PATCH /api/users/:id/password { password }` — reset an admin's password.
- `DELETE /api/users/:id` — delete an admin (not yourself, not the last one).
- `GET  /api/villages` / `POST /api/villages { name }`
- `GET  /api/customers?villageId=&search=`
- `GET  /api/customers/:id` (includes the current loan's payment timeline and `pastLoans`: earlier, cleared loans)
- `GET  /api/customers/:id/payments`
- `GET  /api/customers/:id/photo` — `{ photo }` as a data URI (404 if none); list/detail responses only carry `hasPhoto`
- `POST /api/customers` — give money / create a new customer schedule: `{ name, phone, address, nominee, villageId, given, weekly, weeks, photo }` (`nominee`, `address`, `villageId` and `photo` are optional; `photo` is a `data:image/...` URI)
- `PATCH /api/customers/:id` — edit contact/village details (not the given/weekly/weeks schedule): `{ name, phone, address, nominee, villageId, photo }` (`photo: null` removes it)
- `POST /api/customers/:id/payments` — collect a payment (partials allowed): `{ amount, note }`
- `POST /api/customers/:id/loans` — give a customer whose loan is cleared a new loan: `{ given, weekly, weeks }`. The cleared loan moves to `pastLoans` and the new one starts at week 1 (400 if the current loan still has a balance)
- `GET  /api/expenses` / `POST /api/expenses { category, amount, note }`
- `GET  /api/losses` / `POST /api/losses { customerName, village, remaining, recovered, reason }`
- `GET  /api/dashboard/summary` — admin dashboard totals, week chart, village comparison
