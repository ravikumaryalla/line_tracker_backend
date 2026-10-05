const express = require('express');
const pool = require('../db/connection');
const { paidTotals } = require('../helpers');

const router = express.Router();

async function serializeVillage(v, paid) {
  const customers = (await pool.query('SELECT * FROM customers WHERE village_id = $1', [v.id])).rows;
  const given = customers.reduce((s, c) => s + c.given_amount, 0);
  const collected = customers.reduce((s, c) => s + (paid.get(c.id) || 0), 0);
  return {
    id: v.id, name: v.name,
    customerCount: customers.length, given, collected, pending: Math.max(0, given - collected)
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
