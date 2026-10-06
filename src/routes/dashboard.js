const express = require('express');
const pool = require('../db/connection');
const { paidTotals, pastTotals } = require('../helpers');

const router = express.Router();

router.get('/summary', async (req, res, next) => {
  try {
    const customers = (await pool.query('SELECT * FROM customers')).rows;
    const paid = await paidTotals(pool);
    const past = await pastTotals(pool);
    const paidBy = (c) => paid.get(c.id) || 0;
    const pastOf = (c) => past.get(c.id) || { given: 0, toCollect: 0, paid: 0 };
    // Given / to collect / collected cover every loan; "outside" is what is still owed on current loans.
    const given = customers.reduce((s, c) => s + c.given_amount + pastOf(c).given, 0);
    const toCollect = customers.reduce((s, c) => s + c.total_weeks * c.weekly_amount + pastOf(c).toCollect, 0);
    const collected = customers.reduce((s, c) => s + paidBy(c) + pastOf(c).paid, 0);
    const outside = customers.reduce((s, c) => s + Math.max(0, c.total_weeks * c.weekly_amount - paidBy(c)), 0);
    const expenses = Number((await pool.query('SELECT COALESCE(SUM(amount), 0) s FROM expenses')).rows[0].s);
    const losses = Number((await pool.query('SELECT COALESCE(SUM(remaining - recovered), 0) s FROM losses')).rows[0].s);
    const lossCount = Number((await pool.query('SELECT COUNT(*) c FROM losses')).rows[0].c);
    const net = (toCollect - given) - expenses - losses;

    const todayCollected = Number((await pool.query(
      "SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE paid_on = CURRENT_DATE"
    )).rows[0].s);
    const dueCustomers = customers.filter((c) => paidBy(c) < c.total_weeks * c.weekly_amount);
    // A short final week (after extra payments) only expects what is left.
    const todayExpected = dueCustomers.reduce((s, c) => s + Math.min(c.weekly_amount, c.total_weeks * c.weekly_amount - paidBy(c)), 0);
    const pendingNow = Math.max(0, todayExpected - todayCollected);

    const weekBars = [];
    for (let i = 6; i >= 0; i--) {
      const row = (await pool.query(
        "SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE paid_on = CURRENT_DATE - $1::int",
        [i]
      )).rows[0];
      const d = new Date();
      d.setDate(d.getDate() - i);
      weekBars.push({ day: d.toLocaleDateString('en-US', { weekday: 'short' }), amount: Number(row.s) });
    }
    const weekTotal = weekBars.reduce((s, b) => s + b.amount, 0);

    const villageRows = (await pool.query('SELECT * FROM villages ORDER BY name')).rows;
    const villages = villageRows.map((v) => {
      // Running loans only, matching the Villages screen.
      const vc = customers.filter((c) => c.village_id === v.id && paidBy(c) < c.total_weeks * c.weekly_amount);
      const vGiven = vc.reduce((s, c) => s + c.given_amount, 0);
      const vCollected = vc.reduce((s, c) => s + paidBy(c), 0);
      return { name: v.name, given: vGiven, collected: vCollected };
    });

    res.json({
      given, collected, outside, toCollect, expenses, losses, lossCount, net,
      todayCollected, todayExpected, pendingNow,
      customerCount: customers.length,
      villageCount: villageRows.length,
      weekBars, weekTotal, villages
    });
  } catch (err) { next(err); }
});

module.exports = router;
