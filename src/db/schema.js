const pool = require('./connection');

async function ensureSchema() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS villages (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT,
      address TEXT,
      nominee TEXT,
      village_id INTEGER REFERENCES villages(id),
      given_amount INTEGER NOT NULL,
      weekly_amount INTEGER NOT NULL,
      total_weeks INTEGER NOT NULL,
      weeks_paid INTEGER NOT NULL DEFAULT 0,
      missed_weeks TEXT NOT NULL DEFAULT '[]',
      partial_weeks TEXT NOT NULL DEFAULT '{}',
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE customers ADD COLUMN IF NOT EXISTS nominee TEXT;

    CREATE TABLE IF NOT EXISTS customer_photos (
      customer_id INTEGER PRIMARY KEY REFERENCES customers(id),
      data TEXT NOT NULL
    );

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
      role TEXT NOT NULL DEFAULT 'admin' CHECK (role IN ('admin', 'agent')),
      status TEXT NOT NULL DEFAULT 'approved' CHECK (status IN ('pending', 'approved', 'rejected')),
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      approved_at TIMESTAMPTZ,
      approved_by INTEGER REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_users_status ON users(status);
    CREATE INDEX IF NOT EXISTS idx_users_phone ON users(phone);

    -- Databases created before agents were removed still have agent_id columns. They are left in place
    -- (unused) rather than dropped, but expenses.agent_id was NOT NULL and would block new expenses.
    DO $$
    BEGIN
      IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'expenses' AND column_name = 'agent_id') THEN
        ALTER TABLE expenses ALTER COLUMN agent_id DROP NOT NULL;
      END IF;
    END $$;
    ALTER TABLE users ALTER COLUMN role SET DEFAULT 'admin';
  `);
}

module.exports = { pool, ensureSchema };
