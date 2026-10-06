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

// Every loan, current and past, with the date it started and the date it was cleared (null while running).
// A current loan is cleared on the day of its last payment once it is fully paid.
const ALL_LOANS = `
  WITH cur AS (
    SELECT c.weekly_amount AS weekly, c.given_amount AS given,
           COALESCE(c.loan_started_at, c.created_at)::date AS started,
           CASE WHEN COALESCE(p.s, 0) >= c.total_weeks * c.weekly_amount THEN p.last_paid END AS cleared
    FROM customers c
    LEFT JOIN (SELECT customer_id, loan_no, SUM(amount) s, MAX(paid_on) last_paid FROM payments GROUP BY customer_id, loan_no) p
      ON p.customer_id = c.id AND p.loan_no = c.loan_no
  )
  SELECT weekly, given, started, cleared FROM cur
  UNION ALL
  SELECT weekly_amount, given_amount, started_at::date, closed_at::date FROM past_loans`;

// One Monday–Sunday week; offset 0 is this week, 1 last week, and so on.
router.get('/week', async (req, res, next) => {
  try {
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    // Dates go back and forth as text so the pg driver doesn't shift them by the server's timezone.
    const w = (await pool.query(
      `SELECT TO_CHAR(s, 'YYYY-MM-DD') AS start, TO_CHAR(s + 6, 'YYYY-MM-DD') AS "end",
              TO_CHAR(s, 'DD Mon') || ' – ' || TO_CHAR(s + 6, 'DD Mon') AS label
       FROM (SELECT date_trunc('week', CURRENT_DATE)::date - 7 * $1::int AS s) x`,
      [offset]
    )).rows[0];
    const range = [w.start, w.end];

    const days = (await pool.query(
      `SELECT TO_CHAR(d, 'Dy') AS day, d::date = CURRENT_DATE AS "isToday", COALESCE(SUM(p.amount), 0)::int AS amount
       FROM generate_series($1::date, $2::date, interval '1 day') d
       LEFT JOIN payments p ON p.paid_on = d::date
       GROUP BY d ORDER BY d`,
      range
    )).rows;
    const collected = days.reduce((s, d) => s + d.amount, 0);

    // A loan is expected to pay in a week if it started before the week and wasn't cleared before it.
    const loans = (await pool.query(
      `SELECT COALESCE(SUM(given) FILTER (WHERE started BETWEEN $1::date AND $2::date), 0)::int AS given,
              COUNT(*) FILTER (WHERE started BETWEEN $1::date AND $2::date)::int AS "loansGiven",
              COALESCE(SUM(weekly) FILTER (WHERE started < $1::date AND (cleared IS NULL OR cleared >= $1::date)), 0)::int AS expected,
              COUNT(*) FILTER (WHERE cleared BETWEEN $1::date AND $2::date)::int AS "loansCleared"
       FROM (${ALL_LOANS}) loans`,
      range
    )).rows[0];

    const one = async (sql) => (await pool.query(sql, range)).rows[0].v;
    const newCustomers = await one('SELECT COUNT(*)::int v FROM customers WHERE created_at::date BETWEEN $1::date AND $2::date');
    const expenses = await one('SELECT COALESCE(SUM(amount), 0)::int v FROM expenses WHERE created_at::date BETWEEN $1::date AND $2::date');
    const losses = await one('SELECT COALESCE(SUM(remaining - recovered), 0)::int v FROM losses WHERE created_at::date BETWEEN $1::date AND $2::date');

    res.json({ offset, ...w, days, collected, ...loans, newCustomers, expenses, losses });
  } catch (err) { next(err); }
});

module.exports = router;
