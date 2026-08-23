const express = require('express');
const db = require('../db/connection');

const router = express.Router();

function serializeVillage(v) {
  const agent = v.agent_id ? db.prepare('SELECT id, name FROM agents WHERE id = ?').get(v.agent_id) : null;
  const customers = db.prepare('SELECT * FROM customers WHERE village_id = ?').all(v.id);
  const given = customers.reduce((s, c) => s + c.given_amount, 0);
  const collected = customers.reduce((s, c) => {
    const partial = JSON.parse(c.partial_weeks || '{}');
    const partialSum = Object.values(partial).reduce((x, y) => x + y, 0);
    return s + c.weeks_paid * c.weekly_amount + partialSum;
  }, 0);
  return {
    id: v.id, name: v.name,
    agentId: agent ? agent.id : null, agentName: agent ? agent.name : 'Unassigned',
    customerCount: customers.length, given, collected, pending: Math.max(0, given - collected)
  };
}

router.get('/', (req, res) => {
  const villages = db.prepare('SELECT * FROM villages ORDER BY name').all();
  res.json(villages.map(serializeVillage));
});

router.patch('/:id/assign', (req, res) => {
  const v = db.prepare('SELECT * FROM villages WHERE id = ?').get(req.params.id);
  if (!v) return res.status(404).json({ error: 'Village not found' });
  const { agentId } = req.body;
  const agent = db.prepare('SELECT * FROM agents WHERE id = ?').get(agentId);
  if (!agent) return res.status(400).json({ error: 'agentId must reference an existing agent' });
  db.prepare('UPDATE villages SET agent_id = ? WHERE id = ?').run(agentId, v.id);
  db.prepare('UPDATE customers SET agent_id = ? WHERE village_id = ?').run(agentId, v.id);
  res.json(serializeVillage(db.prepare('SELECT * FROM villages WHERE id = ?').get(v.id)));
});

module.exports = router;
