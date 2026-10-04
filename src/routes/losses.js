const express = require('express');
const pool = require('../db/connection');

const router = express.Router();

const FIELDS = 'id, customer_name, village, remaining, recovered, reason, created_at';

router.get('/', async (req, res, next) => {
  try {
    res.json((await pool.query(`SELECT ${FIELDS} FROM losses ORDER BY created_at DESC`)).rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { customerName, village, remaining, recovered, reason } = req.body;
    if (!customerName || !remaining) {
      return res.status(400).json({ error: 'customerName and remaining are required' });
    }
    const { rows } = await pool.query(
      `INSERT INTO losses (customer_name, village, remaining, recovered, reason)
       VALUES ($1, $2, $3, $4, $5) RETURNING ${FIELDS}`,
      [customerName, village || null, remaining, recovered || 0, reason || 'Not recoverable']
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
