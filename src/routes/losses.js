const express = require('express');
const pool = require('../db/connection');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json((await pool.query('SELECT * FROM losses ORDER BY created_at DESC')).rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { customerName, village, agentName, remaining, recovered, reason } = req.body;
    if (!customerName || !remaining) {
      return res.status(400).json({ error: 'customerName and remaining are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO losses (customer_name, village, agent_name, remaining, recovered, reason)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
      [customerName, village || null, agentName || null, remaining, recovered || 0, reason || 'Not recoverable']
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
