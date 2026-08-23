const express = require('express');
const db = require('../db/connection');

const router = express.Router();

router.get('/', (req, res) => {
  const { agentId } = req.query;
  let sql = 'SELECT e.*, a.name as agent_name FROM expenses e JOIN agents a ON a.id = e.agent_id WHERE 1=1';
  const params = [];
  if (agentId) { sql += ' AND e.agent_id = ?'; params.push(agentId); }
  sql += ' ORDER BY e.created_at DESC';
  res.json(db.prepare(sql).all(...params));
});

router.post('/', (req, res) => {
  const { agentId, category, amount, note } = req.body;
  if (!agentId || !category || !amount) {
    return res.status(400).json({ error: 'agentId, category and amount are required' });
  }
  const info = db.prepare('INSERT INTO expenses (agent_id, category, amount, note) VALUES (?, ?, ?, ?)')
    .run(agentId, category, amount, note || null);
  const row = db.prepare('SELECT e.*, a.name as agent_name FROM expenses e JOIN agents a ON a.id = e.agent_id WHERE e.id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

module.exports = router;
