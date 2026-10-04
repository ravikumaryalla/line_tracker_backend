const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ userId: user.id, role: user.role, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'phone and password are required' });

    const user = (await pool.query('SELECT * FROM users WHERE phone = $1', [phone])).rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    // Only admins use the app; leftover accounts from the old agent app can no longer sign in.
    if (user.role !== 'admin') return res.status(403).json({ error: 'Only admin accounts can sign in' });
    if (!user.active) return res.status(403).json({ error: 'Account deactivated' });

    const token = signToken(user);
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role } });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = (await pool.query('SELECT id, name, phone, role, active FROM users WHERE id = $1', [req.user.id])).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    res.json(user);
  } catch (err) { next(err); }
});

module.exports = router;
