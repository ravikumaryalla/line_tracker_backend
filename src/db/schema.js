const pool = require('./connection');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS agents (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      active BOOLEAN NOT NULL DEFAULT true
    );

    CREATE TABLE IF NOT EXISTS villages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      agent_id INTEGER REFERENCES agents(id)
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      nominee TEXT,
      village_id INTEGER REFERENCES villages(id),
      agent_id INTEGER REFERENCES agents(id),
      given_amount INTEGER NOT NULL,
      weekly_amount INTEGER NOT NULL,
      total_weeks INTEGER NOT NULL,
      weeks_paid INTEGER NOT NULL DEFAULT 0,
      missed_weeks TEXT NOT NULL DEFAULT '[]',
      partial_weeks TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS nominee TEXT;

    CREATE TABLE IF NOT EXISTS payments (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      week_number INTEGER NOT NULL,
      amount INTEGER NOT NULL,
      note TEXT,
      paid_on DATE NOT NULL DEFAULT CURRENT_DATE,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS expenses (
      id SERIAL PRIMARY KEY,
      agent_id INTEGER NOT NULL REFERENCES agents(id),
      category TEXT NOT NULL,
      amount INTEGER NOT NULL,
      note TEXT,
      expense_date TEXT NOT NULL DEFAULT TO_CHAR(CURRENT_DATE, 'DD Mon'),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS losses (
      id SERIAL PRIMARY KEY,
      customer_name TEXT NOT NULL,
      village TEXT,
      agent_name TEXT,
      remaining INTEGER NOT NULL,
      recovered INTEGER NOT NULL DEFAULT 0,
      reason TEXT,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    CREATE TABLE IF NOT EXISTS users (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'agent' CHECK (role IN ('admin', 'agent')),
      status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
      active BOOLEAN NOT NULL DEFAULT true,
      agent_id INTEGER REFERENCES agents(id),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      approved_at TIMESTAMPTZ,
      approved_by INTEGER REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);
  `);
}

module.exports = { pool, ensureSchema };
