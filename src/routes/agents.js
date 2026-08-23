const express = require('express');
const db = require('../db/connection');

const router = express.Router();

function serializeAgent(a) {
  const villages = db.prepare('SELECT name FROM villages WHERE agent_id = ?').all(a.id).map(v => v.name);
  const customers = db.prepare('SELECT * FROM customers WHERE agent_id = ?').all(a.id);
  const collected = db.prepare(
    "SELECT COALESCE(SUM(p.amount), 0) s FROM payments p JOIN customers c ON c.id = p.customer_id WHERE c.agent_id = ? AND p.paid_on = date('now')"
  ).get(a.id).s;
  const weekCollected = db.prepare(
    "SELECT COALESCE(SUM(p.amount), 0) s FROM payments p JOIN customers c ON c.id = p.customer_id WHERE c.agent_id = ? AND p.paid_on >= date('now', '-6 days')"
  ).get(a.id).s;
  const pending = customers.reduce((sum, c) => {
    const partial = JSON.parse(c.partial_weeks || '{}');
    const partialSum = Object.values(partial).reduce((x, y) => x + y, 0);
    const total = c.total_weeks * c.weekly_amount;
    const paid = c.weeks_paid * c.weekly_amount + partialSum;
    return sum + Math.max(0, total - paid);
  }, 0);
  const expenses = db.prepare('SELECT COALESCE(SUM(amount), 0) s FROM expenses WHERE agent_id = ?').get(a.id).s;

  return {
    id: a.id, name: a.name, phone: a.phone, active: !!a.active,
    villages, customerCount: customers.length,
    collectedToday: collected, collectedThisWeek: weekCollected, pending, expenses
  };
}

router.get('/', (req, res) => {
  const agents = db.prepare('SELECT * FROM agents ORDER BY name').all();
  res.json(agents.map(serializeAgent));
});

router.get('/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  res.json(serializeAgent(a));
});

router.patch('/:id', (req, res) => {
  const a = db.prepare('SELECT * FROM agents WHERE id = ?').get(req.params.id);
  if (!a) return res.status(404).json({ error: 'Agent not found' });
  const active = typeof req.body.active === 'boolean' ? (req.body.active ? 1 : 0) : (a.active ? 0 : 1);
  db.prepare('UPDATE agents SET active = ? WHERE id = ?').run(active, a.id);
  res.json(serializeAgent(db.prepare('SELECT * FROM agents WHERE id = ?').get(a.id)));
});

module.exports = router;
