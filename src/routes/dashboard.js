const express = require('express');
const db = require('../db/connection');

const router = express.Router();

router.get('/summary', (req, res) => {
  const customers = db.prepare('SELECT * FROM customers').all();
  const given = customers.reduce((s, c) => s + c.given_amount, 0);
  const toCollect = customers.reduce((s, c) => s + c.total_weeks * c.weekly_amount, 0);
  const collected = customers.reduce((s, c) => {
    const partial = JSON.parse(c.partial_weeks || '{}');
    const partialSum = Object.values(partial).reduce((x, y) => x + y, 0);
    return s + c.weeks_paid * c.weekly_amount + partialSum;
  }, 0);
  const outside = toCollect - collected;
  const expenses = db.prepare('SELECT COALESCE(SUM(amount), 0) s FROM expenses').get().s;
  const losses = db.prepare('SELECT COALESCE(SUM(remaining - recovered), 0) s FROM losses').get().s;
  const lossCount = db.prepare('SELECT COUNT(*) c FROM losses').get().c;
  const net = (toCollect - given) - expenses - losses;

  const todayCollected = db.prepare("SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE paid_on = date('now')").get().s;
  const dueCustomers = customers.filter(c => c.weeks_paid < c.total_weeks);
  const todayExpected = dueCustomers.reduce((s, c) => s + c.weekly_amount, 0);
  const pendingNow = Math.max(0, todayExpected - todayCollected);

  const weekBars = [];
  for (let i = 6; i >= 0; i--) {
    const row = db.prepare(
      "SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE paid_on = date('now', ?)"
    ).get(`-${i} days`);
    const d = new Date();
    d.setDate(d.getDate() - i);
    weekBars.push({ day: d.toLocaleDateString('en-US', { weekday: 'short' }), amount: row.s });
  }
  const weekTotal = weekBars.reduce((s, b) => s + b.amount, 0);

  const villages = db.prepare('SELECT * FROM villages ORDER BY name').all().map(v => {
    const vc = customers.filter(c => c.village_id === v.id);
    const vGiven = vc.reduce((s, c) => s + c.given_amount, 0);
    const vCollected = vc.reduce((s, c) => {
      const partial = JSON.parse(c.partial_weeks || '{}');
      const partialSum = Object.values(partial).reduce((x, y) => x + y, 0);
      return s + c.weeks_paid * c.weekly_amount + partialSum;
    }, 0);
    return { name: v.name, given: vGiven, collected: vCollected };
  });

  res.json({
    given, collected, outside, toCollect, expenses, losses, lossCount, net,
    todayCollected, todayExpected, pendingNow,
    customerCount: customers.length,
    villageCount: db.prepare('SELECT COUNT(*) c FROM villages').get().c,
    weekBars, weekTotal, villages
  });
});

module.exports = router;
