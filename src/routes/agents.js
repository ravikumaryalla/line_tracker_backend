const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/connection');
const { requireRole } = require('../middleware/auth');

const router = express.Router();

async function serializeAgent(a) {
  const villages = (await pool.query('SELECT name FROM villages WHERE agent_id = $1', [a.id])).rows.map((v) => v.name);
  const customers = (await pool.query('SELECT * FROM customers WHERE agent_id = $1', [a.id])).rows;
  const collected = Number((await pool.query(
    "SELECT COALESCE(SUM(p.amount), 0) s FROM payments p JOIN customers c ON c.id = p.customer_id WHERE c.agent_id = $1 AND p.paid_on = CURRENT_DATE",
    [a.id]
  )).rows[0].s);
  const weekCollected = Number((await pool.query(
    "SELECT COALESCE(SUM(p.amount), 0) s FROM payments p JOIN customers c ON c.id = p.customer_id WHERE c.agent_id = $1 AND p.paid_on >= CURRENT_DATE - INTERVAL '6 days'",
    [a.id]
  )).rows[0].s);
  const pending = customers.reduce((sum, c) => {
    const partial = JSON.parse(c.partial_weeks || '{}');
    const partialSum = Object.values(partial).reduce((x, y) => x + y, 0);
    const total = c.total_weeks * c.weekly_amount;
    const paid = c.weeks_paid * c.weekly_amount + partialSum;
    return sum + Math.max(0, total - paid);
  }, 0);
  const expenses = Number((await pool.query('SELECT COALESCE(SUM(amount), 0) s FROM expenses WHERE agent_id = $1', [a.id])).rows[0].s);

  return {
    id: a.id, name: a.name, phone: a.phone, active: !!a.active,
    villages, customerCount: customers.length,
    collectedToday: collected, collectedThisWeek: weekCollected, pending, expenses
  };
}

router.get('/', async (req, res, next) => {
  try {
    const agents = (await pool.query('SELECT * FROM agents ORDER BY name')).rows;
    res.json(await Promise.all(agents.map(serializeAgent)));
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const a = (await pool.query('SELECT * FROM agents WHERE id = $1', [req.params.id])).rows[0];
    if (!a) return res.status(404).json({ error: 'Agent not found' });
    res.json(await serializeAgent(a));
  } catch (err) { next(err); }
});

router.post('/', requireRole('admin'), async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const phone = (req.body.phone || '').replace(/\D/g, '');
    const password = req.body.password || '';
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (phone.length !== 10) return res.status(400).json({ error: 'phone must be 10 digits' });
    if (password && password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

    const dupe = (await pool.query(
      "SELECT id FROM agents WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1", [phone]
    )).rows[0];
    if (dupe) return res.status(409).json({ error: 'An agent with that phone already exists' });

    const { rows } = await pool.query(
      'INSERT INTO agents (name, phone, active) VALUES ($1, $2, true) RETURNING *', [name, phone]
    );

    const agent = rows[0];

    // An admin creating an agent should be all it takes: give them an approved login
    // straight away so they can sign in without a separate signup and approval round.
    const existingUser = (await pool.query(
      "SELECT id FROM users WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1", [phone]
    )).rows[0];

    let login = 'none';
    if (existingUser) {
      // Already signed up (possibly still pending) - link, approve, and reset the
      // password if the admin supplied one.
      const hash = password ? await bcrypt.hash(password, 10) : null;
      await pool.query(
        `UPDATE users SET agent_id = $1, status = 'approved', active = true, approved_at = now(), approved_by = $2,
         password_hash = COALESCE($3, password_hash) WHERE id = $4`,
        [agent.id, req.user.id, hash, existingUser.id]
      );
      login = password ? 'updated' : 'linked';
    } else if (password) {
      const hash = await bcrypt.hash(password, 10);
      await pool.query(
        `INSERT INTO users (name, phone, password_hash, role, status, active, agent_id, approved_at, approved_by)
         VALUES ($1, $2, $3, 'agent', 'approved', true, $4, now(), $5)`,
        [name, phone, hash, agent.id, req.user.id]
      );
      login = 'created';
    }

    res.status(201).json({ ...(await serializeAgent(agent)), login });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const a = (await pool.query('SELECT * FROM agents WHERE id = $1', [req.params.id])).rows[0];
    if (!a) return res.status(404).json({ error: 'Agent not found' });
    const active = typeof req.body.active === 'boolean' ? req.body.active : !a.active;
    await pool.query('UPDATE agents SET active = $1 WHERE id = $2', [active, a.id]);
    const updated = (await pool.query('SELECT * FROM agents WHERE id = $1', [a.id])).rows[0];
    res.json(await serializeAgent(updated));
  } catch (err) { next(err); }
});

module.exports = router;
