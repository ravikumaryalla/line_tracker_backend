const express = require('express');
const db = require('../db/connection');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.prepare('SELECT * FROM losses ORDER BY created_at DESC').all());
});

router.post('/', (req, res) => {
  const { customerName, village, agentName, remaining, recovered, reason } = req.body;
  if (!customerName || !remaining) {
    return res.status(400).json({ error: 'customerName and remaining are required' });
  }
  const info = db.prepare(`
    INSERT INTO losses (customer_name, village, agent_name, remaining, recovered, reason)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(customerName, village || null, agentName || null, remaining, recovered || 0, reason || 'Not recoverable');
  res.status(201).json(db.prepare('SELECT * FROM losses WHERE id = ?').get(info.lastInsertRowid));
});

module.exports = router;
