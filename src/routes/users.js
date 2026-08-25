const express = require('express');
const bcrypt = require('bcrypt');
const pool = require('../db/connection');

const router = express.Router();

const SELECT_FIELDS = 'id, name, phone, role, status, active, created_at, approved_at, approved_by';

router.get('/', async (req, res, next) => {
  try {
    const { status } = req.query;
    const { rows } = status
      ? await pool.query(`SELECT ${SELECT_FIELDS} FROM users WHERE status = $1 ORDER BY created_at DESC`, [status])
      : await pool.query(`SELECT ${SELECT_FIELDS} FROM users ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) { next(err); }
});

router.get('/pending', async (req, res, next) => {
  try {
    const { rows } = await pool.query(`SELECT ${SELECT_FIELDS} FROM users WHERE status = 'pending' ORDER BY created_at DESC`);
    res.json(rows);
  } catch (err) { next(err); }
});

router.patch('/:id/approve', async (req, res, next) => {
  try {
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending') return res.status(400).json({ error: 'User is not pending' });

    const { rows } = await pool.query(
      `UPDATE users SET status = 'approved', approved_at = now(), approved_by = $1 WHERE id = $2 RETURNING ${SELECT_FIELDS}`,
      [req.user.id, user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id/reject', async (req, res, next) => {
  try {
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.status !== 'pending') return res.status(400).json({ error: 'User is not pending' });

    const { rows } = await pool.query(
      `UPDATE users SET status = 'rejected', approved_at = now(), approved_by = $1 WHERE id = $2 RETURNING ${SELECT_FIELDS}`,
      [req.user.id, user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/', async (req, res, next) => {
  try {
    const { name, phone, password, role } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ error: 'name, phone and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });
    if (role && !['admin', 'agent'].includes(role)) return res.status(400).json({ error: 'role must be admin or agent' });

    const existing = (await pool.query('SELECT id FROM users WHERE phone = $1', [phone])).rows[0];
    if (existing) return res.status(409).json({ error: 'Phone already registered' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, status, active, approved_at, approved_by)
       VALUES ($1, $2, $3, $4, 'approved', true, now(), $5)
       RETURNING ${SELECT_FIELDS}`,
      [name, phone, hash, role || 'agent', req.user.id]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const user = (await pool.query('SELECT * FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (req.body.role && !['admin', 'agent'].includes(req.body.role)) return res.status(400).json({ error: 'role must be admin or agent' });

    const role = req.body.role || user.role;
    const active = typeof req.body.active === 'boolean' ? req.body.active : user.active;
    const { rows } = await pool.query(
      `UPDATE users SET role = $1, active = $2 WHERE id = $3 RETURNING ${SELECT_FIELDS}`,
      [role, active, user.id]
    );
    res.json(rows[0]);
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  const client = await pool.connect();
  try {
    const user = (await client.query('SELECT id, role FROM users WHERE id = $1', [req.params.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.id === req.user.id) return res.status(400).json({ error: 'You cannot delete your own account' });

    if (user.role === 'admin') {
      const admins = Number((await client.query("SELECT COUNT(*) c FROM users WHERE role = 'admin' AND id <> $1", [user.id])).rows[0].c);
      if (admins === 0) return res.status(400).json({ error: 'Cannot delete the last admin account' });
    }

    await client.query('BEGIN');
    // approved_by references users(id), so clear the trail this account left on others first.
    await client.query('UPDATE users SET approved_by = NULL WHERE approved_by = $1', [user.id]);
    await client.query('DELETE FROM users WHERE id = $1', [user.id]);
    await client.query('COMMIT');

    res.json({ id: user.id, deleted: true });
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    next(err);
  } finally {
    client.release();
  }
});

module.exports = router;
