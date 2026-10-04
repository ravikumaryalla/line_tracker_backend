const express = require('express');
const pool = require('../db/connection');
const { serializeCustomer, serializeTimeline } = require('../helpers');

const router = express.Router();

router.get('/', async (req, res, next) => {
  try {
    const { villageId, search } = req.query;
    const clauses = [];
    const params = [];
    if (villageId) { params.push(villageId); clauses.push(`village_id = $${params.length}`); }
    const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
    const rows = (await pool.query(`SELECT * FROM customers ${where} ORDER BY name`, params)).rows;
    let out = await Promise.all(rows.map((c) => serializeCustomer(pool, c)));
    if (search) {
      const q = String(search).toLowerCase();
      out = out.filter((c) => (c.name + ' ' + (c.village || '')).toLowerCase().includes(q));
    }
    res.json(out);
  } catch (err) { next(err); }
});

router.get('/:id', async (req, res, next) => {
  try {
    const c = (await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const view = await serializeCustomer(pool, c);
    view.timeline = serializeTimeline(view);
    res.json(view);
  } catch (err) { next(err); }
});

router.get('/:id/payments', async (req, res, next) => {
  try {
    const c = (await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Customer not found' });
    const payments = (await pool.query('SELECT * FROM payments WHERE customer_id = $1 ORDER BY created_at DESC', [c.id])).rows;
    res.json(payments);
  } catch (err) { next(err); }
});

const MAX_PHOTO_LENGTH = 1.5 * 1024 * 1024;

// Photos are optional data URIs; returns an error message or null.
function photoError(photo) {
  if (photo === undefined || photo === null) return null;
  if (typeof photo !== 'string' || !photo.startsWith('data:image/')) return 'photo must be an image data URI';
  if (photo.length > MAX_PHOTO_LENGTH) return 'photo is too large';
  return null;
}

async function savePhoto(customerId, photo) {
  if (photo === undefined) return;
  if (photo === null) {
    await pool.query('DELETE FROM customer_photos WHERE customer_id = $1', [customerId]);
    return;
  }
  await pool.query(
    `INSERT INTO customer_photos (customer_id, data) VALUES ($1, $2)
     ON CONFLICT (customer_id) DO UPDATE SET data = EXCLUDED.data`,
    [customerId, photo]
  );
}

router.get('/:id/photo', async (req, res, next) => {
  try {
    const row = (await pool.query('SELECT data FROM customer_photos WHERE customer_id = $1', [req.params.id])).rows[0];
    if (!row) return res.status(404).json({ error: 'Photo not found' });
    res.json({ photo: row.data });
  } catch (err) { next(err); }
});

// "Give money" — create a new customer and their weekly repayment schedule.
router.post('/', async (req, res, next) => {
  try {
    const { name, phone, address, nominee, villageId, given, weekly, weeks, photo } = req.body;
    if (!name || !given || !weekly || !weeks) {
      return res.status(400).json({ error: 'name, given, weekly and weeks are required' });
    }
    const badPhoto = photoError(photo);
    if (badPhoto) return res.status(400).json({ error: badPhoto });
    const { rows } = await pool.query(
      `INSERT INTO customers (name, phone, address, nominee, village_id, given_amount, weekly_amount, total_weeks)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
      [name, phone || null, address || null, nominee || null, villageId || null, given, weekly, weeks]
    );
    if (photo) await savePhoto(rows[0].id, photo);
    res.status(201).json(await serializeCustomer(pool, rows[0]));
  } catch (err) { next(err); }
});

// Edit contact/village details (not the given/weekly/weeks schedule).
router.patch('/:id', async (req, res, next) => {
  try {
    const c = (await pool.query('SELECT * FROM customers WHERE id = $1', [req.params.id])).rows[0];
    if (!c) return res.status(404).json({ error: 'Customer not found' });

    const name = req.body.name !== undefined ? req.body.name : c.name;
    const phone = req.body.phone !== undefined ? req.body.phone : c.phone;
    const address = req.body.address !== undefined ? req.body.address : c.address;
    const nominee = req.body.nominee !== undefined ? req.body.nominee : c.nominee;
    const villageId = req.body.villageId !== undefined ? req.body.villageId : c.village_id;
    if (!name) return res.status(400).json({ error: 'name is required' });
    const badPhoto = photoError(req.body.photo);
    if (badPhoto) return res.status(400).json({ error: badPhoto });

    const { rows } = await pool.query(
      `UPDATE customers SET name = $1, phone = $2, address = $3, nominee = $4, village_id = $5
       WHERE id = $6 RETURNING *`,
      [name, phone || null, address || null, nominee || null, villageId || null, c.id]
    );
    await savePhoto(c.id, req.body.photo);
    res.json(await serializeCustomer(pool, rows[0]));
  } catch (err) { next(err); }
});

// Collect a payment (partial payments allowed).
router.post('/:id/payments', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const amount = parseInt(req.body.amount, 10);
    if (!amount || amount <= 0) return res.status(400).json({ error: 'amount must be a positive number' });

    await client.query('BEGIN');
    const { rows } = await client.query('SELECT * FROM customers WHERE id = $1 FOR UPDATE', [req.params.id]);
    const c = rows[0];
    if (!c) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Customer not found' }); }

    const partial = JSON.parse(c.partial_weeks || '{}');
    const missed = JSON.parse(c.missed_weeks || '[]');
    const week = c.weeks_paid + 1;
    const alreadyPartial = partial[week] || 0;
    const runningTotal = alreadyPartial + amount;

    let weeksPaid = c.weeks_paid;
    if (runningTotal >= c.weekly_amount) {
      weeksPaid += 1;
      delete partial[week];
    } else {
      partial[week] = runningTotal;
    }
    const missedIdx = missed.indexOf(week);
    if (missedIdx !== -1) missed.splice(missedIdx, 1);

    await client.query(
      "INSERT INTO payments (customer_id, week_number, amount, note, paid_on) VALUES ($1, $2, $3, $4, CURRENT_DATE)",
      [c.id, week, amount, req.body.note || null]
    );
    await client.query(
      'UPDATE customers SET weeks_paid = $1, partial_weeks = $2, missed_weeks = $3 WHERE id = $4',
      [weeksPaid, JSON.stringify(partial), JSON.stringify(missed), c.id]
    );
    await client.query('COMMIT');

    const updated = (await pool.query('SELECT * FROM customers WHERE id = $1', [c.id])).rows[0];
    res.status(201).json(await serializeCustomer(pool, updated));
  } catch (err) {
    await client.query('ROLLBACK');
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
