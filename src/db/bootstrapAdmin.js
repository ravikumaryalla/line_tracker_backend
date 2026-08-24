const bcrypt = require('bcrypt');
const pool = require('./connection');

async function bootstrapAdmin() {
  const phone = process.env.BOOTSTRAP_ADMIN_PHONE;
  const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
  if (!phone || !password) return;

  const existing = (await pool.query('SELECT id FROM users WHERE phone = $1', [phone])).rows[0];
  if (existing) return;

  const hash = await bcrypt.hash(password, 10);
  await pool.query(
    `INSERT INTO users (name, phone, password_hash, role, status, active)
     VALUES ('Admin', $1, $2, 'admin', 'approved', true)
     ON CONFLICT (phone) DO NOTHING`,
    [phone, hash]
  );
  console.log('Bootstrap admin ensured.');
}

module.exports = bootstrapAdmin;
