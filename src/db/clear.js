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

    // Databases created before agents were removed still have an agents table, referenced by users.agent_id.
    const hasAgents = (await client.query("SELECT 1 FROM information_schema.tables WHERE table_name = 'agents'")).rowCount;
    if (hasAgents) {
      const hasUserLink = (await client.query("SELECT 1 FROM information_schema.columns WHERE table_name = 'users' AND column_name = 'agent_id'")).rowCount;
      if (hasUserLink) await client.query('UPDATE users SET agent_id = NULL');
      const { rowCount } = await client.query('DELETE FROM agents');
      await client.query('ALTER SEQUENCE agents_id_seq RESTART WITH 1');
      console.log(`agents: ${rowCount} row(s) deleted`);
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
