# Lending Collection App — Backend

Express + PostgreSQL API for the Lending Collection App (agent field-collection app + admin dashboard).

## Run

```
npm install
cp .env.example .env   # fill in DATABASE_URL with your Postgres connection string
npm start               # http://localhost:4000
```

Tables are created (`CREATE TABLE IF NOT EXISTS`) and seeded with demo data automatically on first run against an empty database.

## API

- `GET  /api/agents` / `GET /api/agents/:id` / `PATCH /api/agents/:id` (toggle/set active)
- `GET  /api/villages` / `PATCH /api/villages/:id/assign { agentId }`
- `GET  /api/customers?agentId=&villageId=&search=`
- `GET  /api/customers/:id` (includes payment timeline)
- `GET  /api/customers/:id/payments`
- `POST /api/customers` — give money / create a new customer schedule: `{ name, phone, address, villageId, agentId, given, weekly, weeks }`
- `POST /api/customers/:id/payments` — collect a payment (partials allowed): `{ amount, note }`
- `GET  /api/expenses?agentId=`
- `POST /api/expenses` — `{ agentId, category, amount, note }`
- `GET  /api/losses`
- `POST /api/losses` — `{ customerName, village, agentName, remaining, recovered, reason }`
- `GET  /api/dashboard/summary` — admin dashboard totals, week chart, village comparison
