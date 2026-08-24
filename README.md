# Lending Collection App — Backend

Express + PostgreSQL API for the Lending Collection App (agent field-collection app + admin dashboard).

## Run

```
npm install
cp .env.example .env   # fill in DATABASE_URL with your Postgres connection string
npm start               # http://localhost:4000
```

Tables are created (`CREATE TABLE IF NOT EXISTS`) and seeded with demo data automatically on first run against an empty database.

### First-time admin bootstrap

Every endpoint except `/api/health` and `/api/auth/*` requires a Bearer token, and only an approved admin can approve/reject/create users — so the very first admin has to be created out-of-band. Set `BOOTSTRAP_ADMIN_PHONE` and `BOOTSTRAP_ADMIN_PASSWORD` in `.env` and start the server once; it inserts an approved admin with those credentials if that phone doesn't already exist (idempotent per phone — safe to leave running, or clear the vars after first boot; changing the vars to a new phone/password creates another admin on the next boot). Log in with that phone/password to get a token, then use `/api/users` to approve real signups or create more admins.

## API

- `POST /api/auth/signup { name, phone, password }` — creates a `pending` account (public, no auth). Cannot log in until approved.
- `POST /api/auth/login { phone, password }` — returns `{ token, user }` once the account is `approved` and `active`.
- `GET  /api/auth/me` — the logged-in user's own record.
- `GET  /api/users?status=` / `GET /api/users/pending` — list users (admin only).
- `PATCH /api/users/:id/approve` / `PATCH /api/users/:id/reject` — decide a pending signup (admin only).
- `POST /api/users { name, phone, password, role }` — admin creates a user directly, auto-approved (admin only).
- `PATCH /api/users/:id { role, active }` — edit a user (admin only).
- `DELETE /api/users/:id` — deactivate a user (admin only).
- `GET  /api/agents` / `GET /api/agents/:id` / `PATCH /api/agents/:id` (toggle/set active)
- `GET  /api/villages` / `PATCH /api/villages/:id/assign { agentId }`
- `GET  /api/customers?agentId=&villageId=&search=`
- `GET  /api/customers/:id` (includes payment timeline)
- `GET  /api/customers/:id/payments`
- `POST /api/customers` — give money / create a new customer schedule: `{ name, phone, address, nominee, villageId, agentId, given, weekly, weeks }` (`nominee` is optional)
- `PATCH /api/customers/:id` — edit contact/assignment details (not the given/weekly/weeks schedule): `{ name, phone, address, nominee, villageId, agentId }`
- `POST /api/customers/:id/payments` — collect a payment (partials allowed): `{ amount, note }`
- `GET  /api/expenses?agentId=`
- `POST /api/expenses` — `{ agentId, category, amount, note }`
- `GET  /api/losses`
- `POST /api/losses` — `{ customerName, village, agentName, remaining, recovered, reason }`
- `GET  /api/dashboard/summary` — admin dashboard totals, week chart, village comparison
