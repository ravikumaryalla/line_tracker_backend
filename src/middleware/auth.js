const jwt = require('jsonwebtoken');
const pool = require('../db/connection');

async function requireAuth(req, res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) return res.status(401).json({ error: 'Missing or invalid Authorization header' });

    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
      return res.status(401).json({ error: 'Invalid or expired token' });
    }

    const user = (await pool.query('SELECT id, role, phone, status, active FROM users WHERE id = $1', [payload.userId])).rows[0];
    if (!user || user.status !== 'approved' || !user.active) {
      return res.status(401).json({ error: 'Account no longer active' });
    }

    req.user = { id: user.id, role: user.role, phone: user.phone };
    next();
  } catch (err) { next(err); }
}

function requireRole(role) {
  return (req, res, next) => {
    if (!req.user || req.user.role !== role) return res.status(403).json({ error: 'Forbidden' });
    next();
  };
}

module.exports = { requireAuth, requireRole };
