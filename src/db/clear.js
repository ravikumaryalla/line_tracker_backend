const pool = require('./connection');

// Deletion order respects the foreign keys between these tables.
const TABLES = ['payments', 'expenses', 'losses', 'customers', 'villages', 'agents'];

async function clear() {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // users.agent_id references agents(id). Null it out so the agents delete succeeds
    // without touching the logins themselves. This is also why we DELETE instead of
    // TRUNCATE: TRUNCATE would demand CASCADE, which wipes the users table with it.
    const unlinked = await client.query('UPDATE users SET agent_id = NULL WHERE agent_id IS NOT NULL');

    for (const table of TABLES) {
      const { rowCount } = await client.query(`DELETE FROM ${table}`);
      await client.query(`ALTER SEQUENCE ${table}_id_seq RESTART WITH 1`);
      console.log(`${table}: ${rowCount} row(s) deleted`);
    }

    await client.query('COMMIT');
    const users = (await client.query('SELECT COUNT(*) c FROM users')).rows[0].c;
    console.log(`Done. ${unlinked.rowCount} user(s) unlinked from agents; ${users} user account(s) kept.`);
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
