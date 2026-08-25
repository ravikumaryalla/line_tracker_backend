const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const pool = require('../db/connection');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

function signToken(user) {
  return jwt.sign({ userId: user.id, role: user.role, phone: user.phone }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

// Agent logins are tied to a row in `agents`. Older accounts predate that link, so fall
// back to matching on the phone number and persist the link when we find one.
async function resolveAgentId(user) {
  if (user.role !== 'agent') return null;
  if (user.agent_id) return user.agent_id;
  const agent = (await pool.query(
    "SELECT id FROM agents WHERE regexp_replace(phone, '[^0-9]', '', 'g') = regexp_replace($1, '[^0-9]', '', 'g')",
    [user.phone]
  )).rows[0];
  if (!agent) return null;
  await pool.query('UPDATE users SET agent_id = $1 WHERE id = $2', [agent.id, user.id]);
  return agent.id;
}

router.post('/signup', async (req, res, next) => {
  try {
    const { name, phone, password } = req.body;
    if (!name || !phone || !password) return res.status(400).json({ error: 'name, phone and password are required' });
    if (password.length < 6) return res.status(400).json({ error: 'password must be at least 6 characters' });

    const existing = (await pool.query('SELECT id FROM users WHERE phone = $1', [phone])).rows[0];
    if (existing) return res.status(409).json({ error: 'Phone already registered' });

    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (name, phone, password_hash, role, status, active)
       VALUES ($1, $2, $3, 'agent', 'pending', true)
       RETURNING id, name, phone, role, status, created_at`,
      [name, phone, hash]
    );
    res.status(201).json(rows[0]);
  } catch (err) { next(err); }
});

router.post('/login', async (req, res, next) => {
  try {
    const { phone, password } = req.body;
    if (!phone || !password) return res.status(400).json({ error: 'phone and password are required' });

    const user = (await pool.query('SELECT * FROM users WHERE phone = $1', [phone])).rows[0];
    if (!user || !(await bcrypt.compare(password, user.password_hash))) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    if (user.status === 'pending') return res.status(403).json({ error: 'Account pending approval' });
    if (user.status === 'rejected') return res.status(403).json({ error: 'Account rejected' });
    if (!user.active) return res.status(403).json({ error: 'Account deactivated' });

    const token = signToken(user);
    const agentId = await resolveAgentId(user);
    res.json({ token, user: { id: user.id, name: user.name, phone: user.phone, role: user.role, agentId } });
  } catch (err) { next(err); }
});

router.get('/me', requireAuth, async (req, res, next) => {
  try {
    const user = (await pool.query(
      'SELECT id, name, phone, role, status, active, agent_id FROM users WHERE id = $1',
      [req.user.id]
    )).rows[0];
    if (!user) return res.status(404).json({ error: 'User not found' });
    const agentId = await resolveAgentId(user);
    delete user.agent_id;
    res.json({ ...user, agentId });
  } catch (err) { next(err); }
});

module.exports = router;
