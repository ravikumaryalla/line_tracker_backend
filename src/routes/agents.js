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
