const express = require('express');
const pool = require('../db/connection');

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

router.post('/', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    const phone = (req.body.phone || '').replace(/\D/g, '');
    if (!name) return res.status(400).json({ error: 'name is required' });
    if (phone.length !== 10) return res.status(400).json({ error: 'phone must be 10 digits' });

    const dupe = (await pool.query(
      "SELECT id FROM agents WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $1", [phone]
    )).rows[0];
    if (dupe) return res.status(409).json({ error: 'An agent with that phone already exists' });

    const { rows } = await pool.query(
      'INSERT INTO agents (name, phone, active) VALUES ($1, $2, true) RETURNING *', [name, phone]
    );

    // Link the matching login, if this agent has already signed up.
    await pool.query(
      "UPDATE users SET agent_id = $1 WHERE regexp_replace(phone, '[^0-9]', '', 'g') = $2 AND agent_id IS NULL",
      [rows[0].id, phone]
    );

    res.status(201).json(await serializeAgent(rows[0]));
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
