const express = require('express');
const pool = require('../db/connection');

const router = express.Router();

async function serializeVillage(v) {
  const agent = v.agent_id ? (await pool.query('SELECT id, name FROM agents WHERE id = $1', [v.agent_id])).rows[0] : null;
  const customers = (await pool.query('SELECT * FROM customers WHERE village_id = $1', [v.id])).rows;
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

router.get('/', async (req, res, next) => {
  try {
    const villages = (await pool.query('SELECT * FROM villages ORDER BY name')).rows;
    res.json(await Promise.all(villages.map(serializeVillage)));
  } catch (err) { next(err); }
});

router.patch('/:id/assign', async (req, res, next) => {
  try {
    const v = (await pool.query('SELECT * FROM villages WHERE id = $1', [req.params.id])).rows[0];
    if (!v) return res.status(404).json({ error: 'Village not found' });
    const { agentId } = req.body;
    const agent = (await pool.query('SELECT * FROM agents WHERE id = $1', [agentId])).rows[0];
    if (!agent) return res.status(400).json({ error: 'agentId must reference an existing agent' });
    await pool.query('UPDATE villages SET agent_id = $1 WHERE id = $2', [agentId, v.id]);
    await pool.query('UPDATE customers SET agent_id = $1 WHERE village_id = $2', [agentId, v.id]);
    const updated = (await pool.query('SELECT * FROM villages WHERE id = $1', [v.id])).rows[0];
    res.json(await serializeVillage(updated));
  } catch (err) { next(err); }
});

module.exports = router;
