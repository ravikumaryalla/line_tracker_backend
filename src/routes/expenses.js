const express = require('express');
const pool = require('../db/connection');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    res.json((await pool.query('SELECT id, category, amount, note, expense_date, created_at FROM expenses ORDER BY created_at DESC')).rows);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { category, amount, note } = req.body;
    if (!category || !amount) {
      return res.status(400).json({ error: 'category and amount are required' });
    }
    const { rows } = await pool.query(
      'INSERT INTO expenses (category, amount, note) VALUES ($1, $2, $3) RETURNING id, category, amount, note, expense_date, created_at',
      [category, amount, note || null]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

module.exports = router;
