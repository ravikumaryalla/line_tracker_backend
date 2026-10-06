const express = require('express');
const pool = require('../db/connection');
const { paidTotals } = require('../helpers');

const router = express.Router();

// paid: map from paidTotals. Totals cover only running loans; customers whose loan is cleared
// count towards customerCount but not activeCount or the money figures.
async function serializeVillage(v, paid) {
  const customers = (await pool.query('SELECT * FROM customers WHERE village_id = $1', [v.id])).rows;
  const paidBy = (c) => paid.get(c.id) || 0;
  const running = customers.filter((c) => paidBy(c) < c.total_weeks * c.weekly_amount);
  const given = running.reduce((s, c) => s + c.given_amount, 0);
  const collected = running.reduce((s, c) => s + paidBy(c), 0);
  const pending = running.reduce((s, c) => s + c.total_weeks * c.weekly_amount - paidBy(c), 0);
  return {
    id: v.id, name: v.name,
    customerCount: customers.length, activeCount: running.length, given, collected, pending
  };
}

router.get('/', async (req, res, next) => {
  try {
    const villages = (await pool.query('SELECT * FROM villages ORDER BY name')).rows;
    const paid = await paidTotals(pool);
    res.json(await Promise.all(villages.map((v) => serializeVillage(v, paid))));
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ error: 'name is required' });

    const dupe = (await pool.query('SELECT id FROM villages WHERE LOWER(name) = LOWER($1)', [name])).rows[0];
    if (dupe) return res.status(409).json({ error: 'A village with that name already exists' });

    const { rows } = await pool.query('INSERT INTO villages (name) VALUES ($1) RETURNING *', [name]);
    res.status(201).json(await serializeVillage(rows[0], new Map()));
  } catch (err) { next(err); }
});

module.exports = router;
