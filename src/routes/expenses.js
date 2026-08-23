const express = require('express');
const pool = require('../db/connection');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { agentId } = req.query;
    const params = [];
    let where = '';
    if (agentId) { params.push(agentId); where = 'WHERE e.agent_id = $1'; }
    const rows = (await pool.query(
      `SELECT e.*, a.name as agent_name FROM expenses e JOIN agents a ON a.id = e.agent_id ${where} ORDER BY e.created_at DESC`,
      params
    )).rows;
    res.json(rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { agentId, category, amount, note } = req.body;
    if (!agentId || !category || !amount) {
      return res.status(400).json({ error: 'agentId, category and amount are required' });
    }
    const { rows } = await pool.query(
      'INSERT INTO expenses (agent_id, category, amount, note) VALUES ($1, $2, $3, $4) RETURNING id',
      [agentId, category, amount, note || null]
    );
    const row = (await pool.query(
      'SELECT e.*, a.name as agent_name FROM expenses e JOIN agents a ON a.id = e.agent_id WHERE e.id = $1',
      [rows[0].id]
    )).rows[0];
    res.status(201).json(row);
  } catch (err) { next(err); }
});

module.exports = router;
