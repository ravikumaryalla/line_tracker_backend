const express = require('express');
const db = require('../db/connection');
const { serializeCustomer, serializeTimeline } = require('../helpers');

const router = express.Router();

router.get('/', (req, res) => {
  const { agentId, villageId, search } = req.query;
  let sql = 'SELECT * FROM customers WHERE 1=1';
  const params = [];
  if (agentId) { sql += ' AND agent_id = ?'; params.push(agentId); }
  if (villageId) { sql += ' AND village_id = ?'; params.push(villageId); }
  sql += ' ORDER BY name';
  let rows = db.prepare(sql).all(...params);
  let out = rows.map(c => serializeCustomer(db, c));
  if (search) {
    const q = String(search).toLowerCase();
    out = out.filter(c => (c.name + ' ' + (c.village || '')).toLowerCase().includes(q));
  }
  res.json(out);
});

router.get('/:id', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const view = serializeCustomer(db, c);
  view.timeline = serializeTimeline(view);
  res.json(view);
});

router.get('/:id/payments', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const payments = db.prepare('SELECT * FROM payments WHERE customer_id = ? ORDER BY created_at DESC').all(c.id);
  res.json(payments);
});

// "Give money" — create a new customer and their weekly repayment schedule.
router.post('/', (req, res) => {
  const { name, phone, address, villageId, agentId, given, weekly, weeks } = req.body;
  if (!name || !given || !weekly || !weeks) {
    return res.status(400).json({ error: 'name, given, weekly and weeks are required' });
  }
  let resolvedAgentId = agentId || null;
  if (villageId && !resolvedAgentId) {
    const v = db.prepare('SELECT agent_id FROM villages WHERE id = ?').get(villageId);
    if (v) resolvedAgentId = v.agent_id;
  }
  const info = db.prepare(`
    INSERT INTO customers (name, phone, address, village_id, agent_id, given_amount, weekly_amount, total_weeks)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `).run(name, phone || null, address || null, villageId || null, resolvedAgentId, given, weekly, weeks);
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(serializeCustomer(db, c));
});

// Collect a payment (partial payments allowed).
router.post('/:id/payments', (req, res) => {
  const c = db.prepare('SELECT * FROM customers WHERE id = ?').get(req.params.id);
  if (!c) return res.status(404).json({ error: 'Customer not found' });
  const amount = parseInt(req.body.amount, 10);
  if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

  const partial = JSON.parse(c.partial_weeks || '{}');
  const missed = JSON.parse(c.missed_weeks || '[]');
  const week = c.weeks_paid + 1;
  const alreadyPartial = partial[week] || 0;
  const runningTotal = alreadyPartial + amount;

  let weeksPaid = c.weeks_paid;
  if (runningTotal >= c.weekly_amount) {
    weeksPaid += 1;
    delete partial[week];
  } else {
    partial[week] = runningTotal;
  }
  const missedIdx = missed.indexOf(week);
  if (missedIdx !== -1) missed.splice(missedIdx, 1);

  db.prepare(`
    INSERT INTO payments (customer_id, week_number, amount, note, paid_on)
    VALUES (?, ?, ?, ?, date('now'))
  `).run(c.id, week, amount, req.body.note || null);

  db.prepare('UPDATE customers SET weeks_paid = ?, partial_weeks = ?, missed_weeks = ? WHERE id = ?')
    .run(weeksPaid, JSON.stringify(partial), JSON.stringify(missed), c.id);

  const updated = db.prepare('SELECT * FROM customers WHERE id = ?').get(c.id);
  res.status(201).json(serializeCustomer(db, updated));
});

module.exports = router;
