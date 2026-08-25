const bcrypt = require('bcrypt');
const pool = require('./connection');

// Usage: NEW_PASSWORD=... node src/db/setPassword.js <phone>
// The password comes from the environment, never argv, so it stays out of shell history.
async function setPassword(rawPhone, password) {
  const phone = (rawPhone || '').replace(/\D/g, '');
  if (phone.length !== 10) throw new Error('Pass a 10-digit phone number as the first argument');
  if (!password || password.length < 6) throw new Error('Set NEW_PASSWORD to at least 6 characters');

  const hash = await bcrypt.hash(password, 10);
  const { rows } = await pool.query(
    `UPDATE users SET password_hash = $1, status = 'approved', active = true
     WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $2
     RETURNING id, name, phone, role, status, active`,
    [hash, phone]
  );
  if (!rows.length) throw new Error(`No user found with phone ${phone}`);
  return rows[0];
}

if (require.main === module) {
  setPassword(process.argv[2], process.env.NEW_PASSWORD)
    .then((user) => {
      console.log(`Password updated for ${user.name} (${user.phone}) - role ${user.role}, ${user.status}, active=${user.active}`);
      return pool.end();
    })
    .catch((err) => { console.error(err.message); process.exit(1); });
}

module.exports = setPassword;
