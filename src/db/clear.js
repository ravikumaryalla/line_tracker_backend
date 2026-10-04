const pool = require('./connection');

// Deletion order respects the foreign keys between these tables. User accounts are kept.
const TABLES = ['payments', 'customer_photos', 'expenses', 'losses', 'customers', 'villages'];

async function clear() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const table of TABLES) {
      const { rowCount } = await client.query(`DELETE FROM ${table}`);
      if (table !== 'customer_photos') await client.query(`ALTER SEQUENCE ${table}_id_seq RESTART WITH 1`);
      console.log(`${table}: ${rowCount} row(s) deleted`);
    }

    await client.query('COMMIT');
    const users = (await client.query('SELECT COUNT(*) c FROM users')).rows[0].c;
    console.log(`Done. ${users} user account(s) kept.`);
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  clear()
    .then(() => pool.end())
    .catch((err) => { console.error(err); process.exit(1); });
}

module.exports = clear;
