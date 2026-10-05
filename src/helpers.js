// Money paid is the sum of payment rows: a week can be paid above the weekly amount.
async function paidFor(pool, customerId) {
  const row = await pool.query('SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE customer_id = $1', [customerId]);
  return Number(row.rows[0].s);
}

// customer_id → total paid, for summaries over many customers.
async function paidTotals(pool) {
  const { rows } = await pool.query('SELECT customer_id, SUM(amount) s FROM payments GROUP BY customer_id');
  return new Map(rows.map((r) => [r.customer_id, Number(r.s)]));
}

async function serializeCustomer(pool, c) {
  const missed = JSON.parse(c.missed_weeks || '[]');
  const partial = JSON.parse(c.partial_weeks || '{}');
  const paid = await paidFor(pool, c.id);
  const total = c.total_weeks * c.weekly_amount;

  const paidTodayRow = await pool.query(
    "SELECT COALESCE(SUM(amount), 0) s FROM payments WHERE customer_id = $1 AND paid_on = CURRENT_DATE",
    [c.id]
  );
  const paidToday = Number(paidTodayRow.rows[0].s);

  const photoRow = await pool.query('SELECT 1 FROM customer_photos WHERE customer_id = $1', [c.id]);

  let villageName = null;
  if (c.village_id) {
    const v = await pool.query('SELECT name FROM villages WHERE id = $1', [c.village_id]);
    villageName = v.rows[0] ? v.rows[0].name : null;
  }

  return {
    id: c.id,
    name: c.name,
    phone: c.phone,
    address: c.address,
    nominee: c.nominee,
    hasPhoto: photoRow.rowCount > 0,
    village: villageName,
    villageId: c.village_id,
    given: c.given_amount,
    weekly: c.weekly_amount,
    totalWeeks: c.total_weeks,
    weeksPaid: c.weeks_paid,
    missedWeeks: missed,
    partialWeeks: partial,
    paid,
    total,
    remaining: Math.max(0, total - paid),
    isDone: paid >= total,
    paidToday,
    isPaidToday: paidToday > 0,
    currentWeek: c.weeks_paid + 1,
    createdAt: c.created_at
  };
}

// payments: [{ week_number, amount, date }] in the order they were made.
function serializeTimeline(customer, payments) {
  const byWeek = {};
  for (const p of payments) (byWeek[p.week_number] = byWeek[p.week_number] || []).push({ amount: p.amount, date: p.date });

  const tl = [];
  for (let w = 1; w <= customer.totalWeeks; w++) {
    // A loan paid off early has no further weeks to show.
    if (customer.isDone && w > customer.weeksPaid) break;
    const weekPayments = byWeek[w] || [];
    const sum = weekPayments.reduce((s, p) => s + p.amount, 0);
    let status = 'upcoming';
    let amount = customer.weekly;
    if (w <= customer.weeksPaid) { status = 'paid'; amount = sum || customer.weekly; }
    else if (sum > 0) { status = 'partial'; amount = sum; }
    else if (customer.missedWeeks.includes(w)) status = 'missed';
    else if (w === customer.currentWeek) status = 'pending';
    tl.push({ week: w, amount, status, payments: weekPayments });
  }
  return tl;
}

module.exports = { paidTotals, serializeCustomer, serializeTimeline };
